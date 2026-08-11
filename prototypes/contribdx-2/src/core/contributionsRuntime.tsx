// ---------------------------------------------------------------------------
// Stands for `packages/core/src/contributionsRuntime.tsx`. The real
// SlotAggregator (frame-synced topic reads, Processor deps, requires gating,
// PerfBudget) is out of scope here and UNCHANGED by this design; this trim
// keeps only what the component-led layer touches:
//
//   1. ContributionsProvider additionally creates a MountedSlotsStore and
//      aggregates the UNION of widget-declared slots (layer 1, unchanged)
//      and component-announced slots (layer 2, new)
//   2. useComponentSlot: the generic hook a slot-bearing component calls,
//      composing `${widgetId}.${slotKey}` from WidgetMetaContext, announcing
//      it for aggregation, and returning the aggregated entries
// ---------------------------------------------------------------------------

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createMountedSlotsStore, MountedSlotsContext } from "./componentSlots";
import {
  type AnyContribution,
  type Contributed,
  type ContributionEntry,
  type ContributionSlotId,
  getContributionsForSlot,
  onContributionsChange,
} from "./contributions";
import { useWidgetMeta } from "./WidgetMetaContext";

const EMPTY_ENTRIES: readonly Contributed<unknown>[] = Object.freeze([]);

// Per-slot registry snapshot cache, mirrors the real
// getContributionsForSlotCached.
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

/** The per-widget aggregated store: slot id -> entries. */
class SlotEntriesStore {
  private entries = new Map<string, readonly Contributed<unknown>[]>();
  private listeners = new Set<() => void>();
  private version = 0;

  get(slot: string): readonly Contributed<unknown>[] {
    return this.entries.get(slot) ?? EMPTY_ENTRIES;
  }
  set(slot: string, value: readonly Contributed<unknown>[]): void {
    this.entries.set(slot, value);
    this.version++;
    for (const cb of this.listeners) cb();
  }
  getVersion = (): number => this.version;
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };
}

const SlotEntriesContext = createContext<SlotEntriesStore | null>(null);

/** One slot's aggregation pipeline, trimmed: no topic plumbing. */
function SlotAggregator({
  slot,
  store,
}: {
  slot: string;
  store: SlotEntriesStore;
}) {
  const contribs = useSyncExternalStore(
    onContributionsChange,
    () => getContributionsForSlotCached(slot),
    () => getContributionsForSlotCached(slot),
  );

  useEffect(() => {
    const collected: Contributed<unknown>[] = [];
    for (const def of contribs) {
      try {
        const result = def.compute({} as never);
        if (result) {
          for (const entry of result) {
            collected.push({ ...entry, contributionId: def.id });
          }
        }
      } catch {
        // Mirrors the real isolation: a throwing contribution is skipped.
      }
    }
    store.set(slot, collected);
  }, [contribs, slot, store]);

  return null;
}

export function ContributionsProvider({
  children,
}: {
  children?: ReactNode;
}): ReactElement {
  const meta = useWidgetMeta();
  const [store] = useState(() => new SlotEntriesStore());
  const [mounted] = useState(() =>
    createMountedSlotsStore(meta?.componentId ?? "unknown"),
  );

  const announced = useSyncExternalStore(
    mounted.subscribe,
    mounted.getSnapshot,
    mounted.getSnapshot,
  );

  // Layer 1 (widget-declared) plus layer 2 (component-announced), deduped.
  // The real file also appends the automatic `${componentId}.badges` slot;
  // unchanged, omitted here.
  const slots = useMemo(() => {
    const declared: readonly string[] = meta?.contributionSlots ?? [];
    return Array.from(new Set([...declared, ...announced]));
  }, [meta, announced]);

  return (
    <SlotEntriesContext.Provider value={store}>
      <MountedSlotsContext.Provider value={mounted}>
        {slots.map((slot) => (
          <SlotAggregator key={slot} slot={slot} store={store} />
        ))}
        {children}
      </MountedSlotsContext.Provider>
    </SlotEntriesContext.Provider>
  );
}

/** Untyped-by-slot-string read, mirrors the real hook of the same name. */
export function useContributionsBySlotId(
  slot: string | null,
): readonly Contributed<unknown>[] {
  const store = useContext(SlotEntriesContext);
  const subscribe = useCallback(
    (onChange: () => void) => (store ? store.subscribe(onChange) : () => {}),
    [store],
  );
  const getVersion = useCallback(
    () => (store ? store.getVersion() : 0),
    [store],
  );
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (!store || slot === null) return EMPTY_ENTRIES;
  return store.get(slot);
}

/** The typed single-slot read, mirrors the real overload. */
export function useContributions<S extends ContributionSlotId>(
  slot: S,
): readonly Contributed<ContributionEntry<S>>[] {
  return useContributionsBySlotId(slot) as readonly Contributed<
    ContributionEntry<S>
  >[];
}

// ── The component-led hook ──────────────────────────────────────────────────

export interface ComponentSlotOptions<K extends string> {
  /**
   * Qualified slot key for a widget hosting the same kind more than once.
   * Grammar-checked: a qualifier prefixes the kind (`"process-filters"` for
   * kind `"filters"`), so the composed id's second segment still names its
   * kind and the address stays two segments.
   */
  as?: `${string}-${K}`;
  /**
   * False makes the slot inert (null id, no announce, empty entries): for a
   * component that only sometimes exposes its slot, and for kind-specific
   * hooks whose caller chose the widget-led explicit-slot path instead.
   */
  enabled?: boolean;
}

/**
 * The generic component-led slot: compose `${widgetId}.${slotKey}` from
 * context, announce it for aggregation while mounted, return its entries.
 * Kind-specific smart hooks (`useContributedFilters()`) wrap this.
 *
 * Outside a widget (no WidgetMeta provider) the slot is inert: null id,
 * empty entries, nothing announced. Same graceful-degrade posture as the
 * rest of core's optional-context hooks.
 */
export function useComponentSlot<K extends string>(
  kind: K,
  opts?: ComponentSlotOptions<K>,
): { slotId: string | null; entries: readonly Contributed<unknown>[] } {
  const meta = useWidgetMeta();
  const mounted = useContext(MountedSlotsContext);
  const enabled = opts?.enabled !== false;
  const slotId =
    enabled && meta ? `${meta.componentId}.${opts?.as ?? kind}` : null;

  useEffect(() => {
    if (slotId === null || mounted === null) return;
    return mounted.announce(slotId);
  }, [slotId, mounted]);

  const entries = useContributionsBySlotId(slotId);
  return { slotId, entries };
}
