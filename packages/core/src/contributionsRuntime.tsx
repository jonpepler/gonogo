import { logger } from "@ksp-gonogo/logger";
import {
  activateProcessor,
  evaluateActiveProcessors,
  type FrameToken,
  getProcessorValue,
  type ProcessorHandle,
  useTelemetryClientOptional,
  useTelemetryStoreOptional,
} from "@ksp-gonogo/sitrep-client";
import type { TopicId } from "@ksp-gonogo/sitrep-sdk";
import { createPanelStore, createStore, type Store } from "@ksp-gonogo/ui-kit";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useWidgetMeta } from "./contexts/WidgetMetaContext";
import type { ContributionSlotKindHandle } from "./contributionSlotKinds";
import {
  type AnyContribution,
  type Contributed,
  type ContributionEntry,
  type ContributionSlotId,
  getContributionsForSlot,
  onContributionsChange,
} from "./contributions";
import { PerfBudget } from "./perf/PerfBudget";

// ---------------------------------------------------------------------------
// Per-slot PerfBudget (CLAUDE.md: any sample-fanning wrapper registers one).
// Slot ids are open-ended (third-party Uplinks declare their own), so a
// single module-scope constant doesn't fit the existing per-source pattern;
// instead one budget is lazily created and cached per slot id the first time
// that slot is aggregated. Each still self-registers into PerfBudget's own
// global registry (its constructor does that), so the dashboard's "Perf
// Budgets" widget picks every one of them up automatically.
// ---------------------------------------------------------------------------
const slotBudgets = new Map<string, PerfBudget>();
function getSlotPerfBudget(slot: string): PerfBudget {
  let budget = slotBudgets.get(slot);
  if (!budget) {
    budget = new PerfBudget({
      name: `Contributions "${slot}" entries recomputed/sec`,
      threshold: 30,
      windowMs: 1000,
      unit: "recomputes",
    });
    slotBudgets.set(slot, budget);
  }
  return budget;
}

interface ContributionSlotEntry {
  id: string; // the slot id
  entries: readonly Contributed<unknown>[];
}

const EMPTY_ENTRIES: readonly Contributed<unknown>[] = Object.freeze([]);

// Stable empty snapshot for the no-store case (a bare widget or a test
// rendered without a `ContributionsProvider`). Same referential-stability
// requirement as `EMPTY_ENTRIES` above, just typed for the whole-slot-array
// shape `useAllContributionSlots` returns.
const EMPTY_SLOT_ENTRIES: readonly ContributionSlotEntry[] = Object.freeze([]);

// Stable empty snapshot for the no-`ContributionsProvider` case in the
// mounted-slots subscription, same referential-stability requirement as the
// two above.
const EMPTY_MOUNTED_SLOTS: readonly string[] = Object.freeze([]);

// Stable empty snapshot for the no-`TelemetryProvider` case (a bare widget
// or a test rendered without one). `useSyncExternalStore` requires a
// referentially stable value between calls that haven't genuinely changed,
// a fresh `{}` literal on every call would make React see a "changed"
// snapshot on every render and error with "getSnapshot should be cached".
const EMPTY_TOPIC_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});

const ContributionsPanelStore = createPanelStore<Store<ContributionSlotEntry>>(
  () => createStore<ContributionSlotEntry>(),
);

// ---------------------------------------------------------------------------
// Mounted (component-led) slots. A slot-bearing component announces its
// minted `<widgetId>.<kind>` address while mounted, and the widget's own
// `ContributionsAggregation` unions those with the widget-declared list, so
// the SAME `SlotAggregator` pipeline serves both layers. Ref-counted: the
// same kind mounted twice in one widget is ONE slot with one aggregator
// (both instances read one pool), and StrictMode's mount/unmount/mount is a
// count bounce, not a teardown race.
// ---------------------------------------------------------------------------

interface MountedSlotsStore {
  /** Announce a slot id for the caller's mount lifetime; returns the release. */
  acquire(slotId: string): () => void;
  subscribe(onChange: () => void): () => void;
  getSnapshot(): readonly string[];
}

function createMountedSlotsStore(): MountedSlotsStore {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  // useSyncExternalStore needs a referentially stable snapshot between
  // changes, so the id array is rebuilt only when the SET of ids changes
  // (count bounces above zero never notify).
  let snapshot: readonly string[] = Object.freeze([]);
  const notify = () => {
    snapshot = Object.freeze(Array.from(counts.keys()));
    for (const cb of listeners) cb();
  };
  return {
    acquire(slotId) {
      const next = (counts.get(slotId) ?? 0) + 1;
      counts.set(slotId, next);
      if (next === 1) notify();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = counts.get(slotId) ?? 0;
        if (current <= 1) {
          counts.delete(slotId);
          notify();
        } else {
          counts.set(slotId, current - 1);
        }
      };
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => snapshot,
  };
}

const MountedSlotsContext = createContext<MountedSlotsStore | null>(null);

// useSyncExternalStore requires a referentially-stable snapshot between
// changes, so the registry's per-slot array is memoised the same way
// AugmentSlot.tsx's getAugmentsForSlotCached is.
const slotCache = new Map<string, AnyContribution[]>();
let cacheValid = false;
onContributionsChange(() => {
  cacheValid = false;
  slotCache.clear();
});
function getContributionsForSlotCached(slot: string): AnyContribution[] {
  if (!cacheValid) {
    slotCache.clear();
    cacheValid = true;
  }
  let cached = slotCache.get(slot);
  if (cached === undefined) {
    cached = getContributionsForSlot(slot);
    slotCache.set(slot, cached);
  }
  return cached;
}

/** Element-wise reference equality: true when every entry is the SAME object as before. */
function entriesUnchanged(
  a: readonly Contributed<unknown>[],
  b: readonly Contributed<unknown>[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * One slot's aggregation pipeline: bulk-reads the union of every gated-in
 * contribution's `deps` once per Sitrep frame, calls each contribution's
 * `compute()` in a plain loop (no hooks, no Rules-of-Hooks problem: the
 * registered set may change freely at runtime), isolates a throwing
 * contribution with try/catch, and writes the aggregated array into the
 * per-widget store under this slot's key.
 *
 * Isolated into its own component (mirrors AugmentSlot.tsx's AugmentEntry)
 * so each slot's own hooks have a stable position regardless of how many
 * sibling slots the widget declares.
 */
function SlotAggregator({
  slot,
  store,
}: {
  slot: string;
  store: Store<ContributionSlotEntry>;
}) {
  const contribs = useSyncExternalStore(
    onContributionsChange,
    () => getContributionsForSlotCached(slot),
    () => getContributionsForSlotCached(slot),
  );

  const unionDeps = useMemo(() => {
    const topics = new Set<TopicId>();
    const processors = new Map<string, ProcessorHandle<unknown>>();
    // Every domain a contribution names via `requires` needs its own
    // `<domain>.available` subscription too, NOT just a `client.getValue()`
    // read: `getValue` returns whatever the store currently holds, but the
    // stub/production transport alike only ever DELIVERS a sample for a
    // topic something has subscribed to (see `StubTransport.emit`'s own
    // subscription gate). Without this, `requires` silently depends on
    // some UNRELATED widget elsewhere on the dashboard happening to
    // already subscribe to that same `.available` topic (true almost
    // always in the live app, since a Kerbalism-gated widget's own
    // `RequiresGuard` does exactly that) and evaluates to "domain absent"
    // whenever this slot's own widget is the only thing on screen, e.g.
    // ShipMap hosting a Kerbalism part-meters contribution with no OTHER
    // Kerbalism widget mounted. Found rendering the ShipMap self-
    // contribution arc (spec §13.4) in isolation.
    for (const c of contribs) {
      for (const d of c.deps ?? []) {
        if (typeof d === "string") topics.add(d as TopicId);
        else processors.set(d.id, d);
      }
      if (c.requires) topics.add(`${c.requires}.available` as TopicId);
    }
    return {
      topics: Array.from(topics),
      processors: Array.from(processors.values()),
    };
  }, [contribs]);

  const client = useTelemetryClientOptional();
  const telemetryStore = useTelemetryStoreOptional();

  // Activate every Processor this slot's contributions dep on, for the slot's
  // lifetime. Processor freshness rides the same `subscribeFrame` the Topic
  // reads already use (the evaluator evaluates on that frame boundary), so no
  // separate per-processor subscription is needed in `subscribe`.
  useEffect(() => {
    const deactivates = unionDeps.processors.map((p) =>
      activateProcessor(p.id),
    );
    return () => {
      for (const d of deactivates) d();
    };
  }, [unionDeps.processors]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!client || !telemetryStore) return () => {};
      const unsubscribeInputs = unionDeps.topics.map((topic) =>
        client.subscribe(topic, () => {}),
      );
      const unsubscribeFrame = telemetryStore.subscribeFrame(() => {
        // Force this slot's Processor deps fresh for the just-begun frame
        // BEFORE notifying React: a slot's own frame listener can fire before
        // the evaluator's shared one (the evaluator connects on the parent
        // provider's effect, after this child already subscribed), which would
        // otherwise cache a pre-evaluation snapshot for the frame. Idempotent
        // and skipped entirely for a slot with no Processor deps.
        if (unionDeps.processors.length > 0) evaluateActiveProcessors();
        onChange();
      });
      return () => {
        unsubscribeFrame();
        for (const u of unsubscribeInputs) u();
      };
    },
    [client, telemetryStore, unionDeps],
  );

  // Caches the last-built topic-values object keyed on the `FrameToken` it
  // was built from. `telemetryStore.currentFrame()` returns the SAME token
  // object for the whole life of a frame (only `beginFrame()` mints a new
  // one), so re-reading within one frame (e.g. React's own render-vs-commit
  // tearing check inside `useSyncExternalStore`) hits the cache and returns
  // the identical object; only a genuine new frame rebuilds it. Without
  // this, `getSnapshot` would return a fresh object on every call and
  // trigger React's "the result of getSnapshot should be cached" loop.
  const topicCacheRef = useRef<{
    token: FrameToken;
    values: Record<string, unknown>;
  } | null>(null);

  const getSnapshot = useCallback((): Record<string, unknown> => {
    if (!telemetryStore) return EMPTY_TOPIC_VALUES;
    const token = telemetryStore.currentFrame();
    const cached = topicCacheRef.current;
    if (cached && cached.token === token) return cached.values;
    const values: Record<string, unknown> = {};
    for (const topic of unionDeps.topics) {
      const point = telemetryStore.sample(topic, token);
      values[topic] = point ? point.payload : undefined;
    }
    for (const p of unionDeps.processors) {
      values[p.id] = getProcessorValue(p.id);
    }
    topicCacheRef.current = { token, values };
    return values;
  }, [telemetryStore, unionDeps]);

  const topicValues = useSyncExternalStore(subscribe, getSnapshot);
  const budget = useMemo(() => getSlotPerfBudget(slot), [slot]);

  useEffect(() => {
    const collected: Contributed<unknown>[] = [];
    for (const def of contribs) {
      if (
        def.requires &&
        client?.getValue(`${def.requires}.available`) === undefined
      ) {
        continue; // Domain absent: this contribution does not run.
      }
      try {
        const result = def.compute(topicValues as never);
        if (result) {
          for (const entry of result) {
            collected.push({
              ...entry,
              contributionId: def.id,
              owner: def.owner,
            });
          }
        }
      } catch (err) {
        logger.error(
          `Contribution "${def.id}" threw; skipped`,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }
    budget.record();
    const current = store.getSnapshot().find((e) => e.id === slot);
    if (current && entriesUnchanged(current.entries, collected)) return;
    store.update(slot, { entries: collected });
    // register() is a no-op-safe upsert on first write: update() alone
    // returns early on an unknown id, so seed the entry once.
    if (!current) store.register({ id: slot, entries: collected });
  }, [contribs, topicValues, slot, store, budget, client]);

  return null;
}

export function ContributionsProvider({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  const mounted = useMemo(createMountedSlotsStore, []);
  return (
    <MountedSlotsContext.Provider value={mounted}>
      <ContributionsPanelStore.Provider>
        <ContributionsAggregation>{children}</ContributionsAggregation>
      </ContributionsPanelStore.Provider>
    </MountedSlotsContext.Provider>
  );
}

function ContributionsAggregation({ children }: { children?: ReactNode }) {
  const meta = useWidgetMeta();
  const store = ContributionsPanelStore.useStore();
  const mounted = useContext(MountedSlotsContext);
  const mountedSlots = useSyncExternalStore(
    useCallback(
      (onChange: () => void) =>
        mounted ? mounted.subscribe(onChange) : () => {},
      [mounted],
    ),
    () => (mounted ? mounted.getSnapshot() : EMPTY_MOUNTED_SLOTS),
    () => (mounted ? mounted.getSnapshot() : EMPTY_MOUNTED_SLOTS),
  );
  // The standard badges slot is ALWAYS aggregated, on top of whatever the
  // widget itself declared (contribution-slots-spec §13.2: automatic, zero
  // widget-side input) and whatever slot-bearing components are currently
  // mounted (`useContributionSlot`). Deduped: a widget may list a slot in
  // contributionSlots that a mounted component also mints (harmless either
  // way, one aggregator runs).
  const slots = useMemo((): readonly string[] => {
    const declared: readonly string[] = meta?.contributionSlots ?? [];
    const union: string[] = [...declared];
    if (meta) {
      const badgesSlot = `${meta.componentId}.badges`;
      if (!union.includes(badgesSlot)) union.push(badgesSlot);
    }
    for (const slot of mountedSlots) {
      if (!union.includes(slot)) union.push(slot);
    }
    return union;
  }, [meta, mountedSlots]);

  if (!store) return <>{children}</>;

  return (
    <>
      {slots.map((slot) => (
        <SlotAggregator key={slot} slot={slot} store={store} />
      ))}
      {children}
    </>
  );
}

/**
 * The single subscription point: the whole per-widget store's slot-entry
 * array, one `useSyncExternalStore` regardless of how many slots the caller
 * ultimately reads. Both `useContributionsBySlotId` and `useContributions`
 * build on this instead of each subscribing per slot, since the store
 * already holds every slot's entries together and a plain `.find` is all a
 * single-slot read needs.
 */
function useAllContributionSlots(): readonly ContributionSlotEntry[] {
  const store = ContributionsPanelStore.useStore();
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : () => {}),
    [store],
  );
  const getSnapshot = useCallback(
    (): readonly ContributionSlotEntry[] =>
      store ? store.getSnapshot() : EMPTY_SLOT_ENTRIES,
    [store],
  );
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Untyped-by-slot-string read, shared by both public useContributions overloads and Task 2.3's useWidgetBadges. */
export function useContributionsBySlotId(
  slot: string,
): readonly Contributed<unknown>[] {
  const snapshot = useAllContributionSlots();
  return snapshot.find((e) => e.id === slot)?.entries ?? EMPTY_ENTRIES;
}

export function useContributions<S extends ContributionSlotId>(
  slot: S,
): readonly Contributed<ContributionEntry<S>>[];
export function useContributions<const T extends readonly ContributionSlotId[]>(
  slots: T,
): { [K in T[number]]: readonly Contributed<ContributionEntry<K>>[] };
export function useContributions(
  slotOrSlots: string | readonly string[],
): unknown {
  const snapshot = useAllContributionSlots();
  const read = (slot: string): readonly Contributed<unknown>[] =>
    snapshot.find((e) => e.id === slot)?.entries ?? EMPTY_ENTRIES;

  if (typeof slotOrSlots === "string") return read(slotOrSlots);
  return Object.fromEntries(slotOrSlots.map((slot) => [slot, read(slot)]));
}

/**
 * The component-led read (contribution-slots: component-led layer). A
 * slot-bearing component (ui-kit's filter bar, a badge strip, a meter layer)
 * calls this with its own registered kind handle; the slot id is minted from
 * the HOST widget's identity (`useWidgetMeta`), never passed by the widget,
 * so mounting the component anywhere is all it takes for `<widgetId>.<kind>`
 * to go live: no `contributionSlots` entry, no per-widget re-declaration.
 *
 * While mounted, the hook announces the slot to the widget's
 * `ContributionsProvider` so a `SlotAggregator` runs for it: the same
 * pipeline (deps union, Processor activation, requires gating, PerfBudget,
 * error isolation) widget-declared slots get. The read itself is the same
 * store read `useContributions` uses; `Entry` comes off the kind handle's
 * phantom, so the component's own rendering is typed without a cast.
 *
 * `qualifier` disambiguates a widget hosting the same kind twice ON PURPOSE
 * as two distinct extension points: it prefixes the kind segment
 * (`resource-ops.process-filters`), keeping the two-segment address shape.
 * Without it, two mounts of one kind in one widget share one slot, which is
 * the intended default: the slot belongs to the widget, not to the DOM
 * instance, so the same extension point rendered twice shows the same pool.
 *
 * Outside a widget (no `WidgetMetaContext`, e.g. a bare component test or a
 * styleguide render) `slotId` is null and `entries` is stably empty, the
 * same graceful posture as the rest of this file's optional contexts.
 */
export function useContributionSlot<Entry>(
  handle: ContributionSlotKindHandle<string, Entry>,
  options?: { qualifier?: string },
): { slotId: string | null; entries: readonly Contributed<Entry>[] } {
  const meta = useWidgetMeta();
  const mounted = useContext(MountedSlotsContext);
  const segment = options?.qualifier
    ? `${options.qualifier}-${handle.kind}`
    : handle.kind;
  const slotId = meta ? `${meta.componentId}.${segment}` : null;

  useEffect(() => {
    if (!mounted || slotId === null) return;
    return mounted.acquire(slotId);
  }, [mounted, slotId]);

  const entries = useContributionsBySlotId(slotId ?? "");
  return {
    slotId,
    entries: entries as readonly Contributed<Entry>[],
  };
}
