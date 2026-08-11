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
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { useWidgetMeta, useWidgetSlotId } from "./contexts/WidgetMetaContext";
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

// Stable empty snapshot for the no-`TelemetryProvider` case (a bare widget
// or a test rendered without one). `useSyncExternalStore` requires a
// referentially stable value between calls that haven't genuinely changed,
// a fresh `{}` literal on every call would make React see a "changed"
// snapshot on every render and error with "getSnapshot should be cached".
const EMPTY_TOPIC_VALUES: Readonly<Record<string, unknown>> = Object.freeze({});

const ContributionsPanelStore = createPanelStore<Store<ContributionSlotEntry>>(
  () => createStore<ContributionSlotEntry>(),
);

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
 * contribution with try/catch, and returns the aggregated array,
 * referentially stable while every entry is unchanged.
 *
 * Two consumers: `SlotAggregator` (a widget-led slot declared in
 * `contributionSlots`, plus the automatic badges slot) writes the result
 * into the per-widget store for `useContributions` readers anywhere in the
 * widget's tree; `useComponentContributions` (a component-led slot) consumes
 * it in place, no store round-trip, because the mounting component is the
 * slot's only reader. An empty `slot` (a component-led slot mounted outside
 * any widget) aggregates nothing and records no budget.
 */
function useSlotEntries(slot: string): readonly Contributed<unknown>[] {
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
  const budget = useMemo(
    () => (slot === "" ? null : getSlotPerfBudget(slot)),
    [slot],
  );

  // `compute()` is documented pure, so running it during render (memoised on
  // its actual inputs) is sound, including under StrictMode's double render.
  // The ref is a memo cache: when every recomputed entry is the SAME object
  // as last time, the previous array is returned so consumers keyed on the
  // array's identity stay quiet across frames that changed nothing.
  const lastEntriesRef = useRef<readonly Contributed<unknown>[]>(EMPTY_ENTRIES);
  const entries = useMemo(() => {
    // Recorded per recompute attempt (every frame with live inputs), matching
    // the budget's "entries recomputed/sec" name, not per changed result.
    budget?.record();
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
    if (entriesUnchanged(lastEntriesRef.current, collected)) {
      return lastEntriesRef.current;
    }
    lastEntriesRef.current = collected;
    return collected;
  }, [contribs, topicValues, client, budget]);

  return entries;
}

/**
 * The read half of a COMPONENT-LED contribution slot: a reusable component
 * (a filter bar, a chip strip) that renders contributed data declares only
 * its own second segment, and the full id completes to
 * `${componentId}.<segment>` from the mounting widget's context, exactly the
 * automatic badges slot's model. The widget mounts the component and is
 * otherwise unconcerned: no `contributionSlots` listing, no hook call, no
 * slot id anywhere in the widget body.
 *
 * Untyped by design, same posture as `useWidgetBadges`: the segment is a
 * runtime string, never a member of the declaration-merged
 * `ContributionRegistry`, so the component (which owns its entry type
 * generically) casts the result. Contributors are unaffected: the
 * widget-side `ContributionRegistry` line still types `registerContribution`
 * for the completed id, identically to a widget-led slot.
 *
 * Aggregates in place (deps union, `requires` gating, PerfBudget, error
 * isolation, all shared with the widget-led pipeline) rather than through
 * the per-widget store: the mounting component is the slot's only reader, so
 * no fanout is needed and the hook works even without a
 * `ContributionsProvider`. Do not ALSO list a component-led slot in the
 * widget's `contributionSlots`: that would stand up a second, store-side
 * aggregation of the same slot.
 *
 * Outside a widget (bare mount, test without WidgetMetaContext) there is no
 * slot, and the hook returns a stable empty array.
 */
export function useComponentContributions(
  segment: string,
): readonly Contributed<unknown>[] {
  const slotId = useWidgetSlotId(segment);
  return useSlotEntries(slotId ?? "");
}

/**
 * A widget-led slot's store writer: runs the shared aggregation pipeline and
 * publishes the result into the per-widget store under this slot's key, for
 * `useContributions` readers anywhere in the widget's tree.
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
  const entries = useSlotEntries(slot);

  useEffect(() => {
    const current = store.getSnapshot().find((e) => e.id === slot);
    if (current && entriesUnchanged(current.entries, entries)) return;
    store.update(slot, { entries });
    // register() is a no-op-safe upsert on first write: update() alone
    // returns early on an unknown id, so seed the entry once.
    if (!current) store.register({ id: slot, entries });
  }, [entries, slot, store]);

  return null;
}

export function ContributionsProvider({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  return (
    <ContributionsPanelStore.Provider>
      <ContributionsAggregation>{children}</ContributionsAggregation>
    </ContributionsPanelStore.Provider>
  );
}

function ContributionsAggregation({ children }: { children?: ReactNode }) {
  const meta = useWidgetMeta();
  const store = ContributionsPanelStore.useStore();
  // The standard badges slot is ALWAYS aggregated, on top of whatever the
  // widget itself declared (contribution-slots-spec §13.2: automatic, zero
  // widget-side input). Deduped in case a widget also explicitly lists its
  // own badges slot in contributionSlots (harmless either way).
  const slots = useMemo(() => {
    const declared = meta?.contributionSlots ?? [];
    if (!meta) return declared;
    const badgesSlot = `${meta.componentId}.badges`;
    return declared.includes(badgesSlot as never)
      ? declared
      : [...declared, badgesSlot as never];
  }, [meta]);

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
