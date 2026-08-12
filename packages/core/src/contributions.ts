import { logger } from "@ksp-gonogo/logger";
import type { Dep } from "@ksp-gonogo/sitrep-client";
import type { TopicId, TopicPayload } from "@ksp-gonogo/sitrep-sdk";
import type {
  AugmentSettingField,
  NamespacedAugmentSettings,
} from "./augments";
import type { UplinkClientHandle } from "./uplinkClients";

// ---------------------------------------------------------------------------
// The contribution model (contribution-slots-spec.md §3-4): a pure-data
// sibling of the augment model. An augment contributes a component and owns
// its rendering; a contribution contributes typed DATA and the host renders
// it with the host's own chrome. Same declaration-merge seam as SlotRegistry
// (augments.ts), same requires/priority/settings shape, different payload.
// ---------------------------------------------------------------------------

/**
 * Global slot -> {ctx, entry, topics} registry, extended via declaration
 * merging exactly like SlotRegistry (augments.ts). `topics` is the union of
 * Topic ids a contribution bound to this slot may read; omit it for a slot
 * that needs no topics.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam, mirrors SlotRegistry
export interface ContributionRegistry {}

/** Union of every declared in-tree contribution slot id. `never` until a package merges one in. */
export type ContributionSlotId = keyof ContributionRegistry;

// ---------------------------------------------------------------------------
// Segment-keyed registry for HOST-INVARIANT component slot types.
//
// A reusable component (mostly ui-kit / `@ksp-gonogo/ui`) cannot write the
// full slot literal `${componentId}.${segment}`, because it does not know
// which widget it is mounted in. So it writes only the SEGMENT ("filters") and
// the primitives complete `${componentId}.${segment}` from `useWidgetMeta()`
// at runtime. This registry maps a SEGMENT -> the entry type its contributions
// carry: the host-invariant sibling of `ContributionRegistry`'s full-id map.
//
// The framework owns the universal `filters` segment here, once, forever, so
// every component / widget / contributor writes nothing. A component inventing
// a NOVEL host-invariant segment declares its one line co-located at the
// bottom of its own file, the same way a widget's other module-load
// self-registrations sit alongside its `registerComponent` call:
//
//   declare module "@ksp-gonogo/core" {
//     interface ComponentSlotRegistry { "my-segment": MyEntry }
//   }
//
// OVERRIDE HATCH (documented, unused in this change): a widget that needs a
// HOST-SPECIFIC entry type for one completed key: the rare component slot whose
// entry genuinely depends on the host: overrides the host-invariant default by
// declaring that full key in `ContributionRegistry` in its OWN package. The
// full-id branch of `ContributionEntry` below wins over the segment branch, so
// the override is cleanly cordoned, never on the common path.
// ---------------------------------------------------------------------------

export interface ComponentSlotRegistry {
  /**
   * The framework-universal filter segment: a contribution is a pre-filled
   * SEARCH TERM (a plain string) that `FilterList` shows as a toggle. Host-
   * invariant, the same string means the same thing in any widget.
   */
  filters: string;
}

/** Every segment declared as a host-invariant component slot. */
export type ComponentSlotSegment = keyof ComponentSlotRegistry;

/** The trailing segment of a completed slot id: `"resource-ops.filters"` -> `"filters"`. */
type SegmentOf<S extends string> = S extends `${string}.${infer Rest}`
  ? Rest extends `${string}.${string}`
    ? SegmentOf<Rest>
    : Rest
  : never;

/**
 * The entry shape a slot renders. Resolution order:
 *  1. a full slot id declared in {@link ContributionRegistry} (host-specific,
 *     the override hatch and every existing widget-led slot) wins outright
 *  2. else the slot's trailing SEGMENT in {@link ComponentSlotRegistry} (the
 *     host-invariant component-slot case, e.g. `*.filters` -> `string`)
 *  3. else a loose record, the out-of-repo / undeclared fallback.
 */
export type ContributionEntry<S extends string> =
  S extends keyof ContributionRegistry
    ? ContributionRegistry[S] extends { entry: infer E }
      ? E
      : Record<string, unknown>
    : [SegmentOf<S>] extends [ComponentSlotSegment]
      ? [SegmentOf<S>] extends [never]
        ? Record<string, unknown>
        : ComponentSlotRegistry[SegmentOf<S>]
      : Record<string, unknown>;

type DeclaredTopicUnion<S extends string> = S extends keyof ContributionRegistry
  ? ContributionRegistry[S] extends { topics: infer T extends string }
    ? T
    : never
  : never;

/**
 * The typed argument a slot's contributions receive: current values of every
 * declared topic, keyed by topic id. The `& Record<string, unknown>` tail keeps
 * a Processor dep readable by its stamped id (`topics[processor.id]`, typed
 * `unknown`) while the mapped head preserves each declared Topic's precise
 * payload type (intersection: a declared topic key keeps `TopicPayload<K>`,
 * since `X & unknown = X`).
 */
export type ContributionTopics<S extends string> = {
  readonly [K in DeclaredTopicUnion<S> & TopicId]: TopicPayload<K> | undefined;
} & Record<string, unknown>;

/** One rendered entry, tagged with provenance for keys and blame. */
export type Contributed<E> = E & {
  readonly contributionId: string;
  readonly owner?: UplinkClientHandle;
};

export interface ContributionDefinition<S extends string = string> {
  /** Stable id, unique GLOBALLY (same flat namespace as augment ids). */
  id: string;
  /** The slot this contribution feeds. */
  contributes: S;
  /**
   * This contribution's own deps: Topics and/or Processors, statically
   * declared (contribution-slots-spec §14: shared `deps` field with Processor).
   * A ProcessorHandle dep resolves to that processor's frame-memoised value
   * (read by its stamped id); a TopicId dep resolves as it always has.
   */
  deps?: readonly Dep[];
  /**
   * Pure. Receives the current values of `deps`, typed. Returns entries to
   * render, or null/undefined for "nothing now". MUST be referentially
   * stable when inputs are unchanged; the host's aggregation store applies a
   * shallow-equal guard as a backstop, not a substitute.
   */
  compute: (
    topics: ContributionTopics<S>,
  ) => readonly ContributionEntry<S>[] | null | undefined;
  /** Domain presence gate, identical semantics to AugmentDefinition.requires. */
  requires?: string;
  /** Ascending, ties in registration order. Same as augments.ts. */
  priority?: number;
  settings?: readonly AugmentSettingField[];
  /** Stamped by `defineUplinkClient(...).registerContribution`, never set by hand. */
  owner?: UplinkClientHandle;
}

export type AnyContribution = ContributionDefinition<string>;

const contributions = new Map<
  string,
  { def: AnyContribution; order: number }
>();
let registrationCounter = 0;

const contributionListeners = new Set<() => void>();
function notifyContributionChange(): void {
  for (const cb of contributionListeners) cb();
}

export function onContributionsChange(cb: () => void): () => void {
  contributionListeners.add(cb);
  return () => {
    contributionListeners.delete(cb);
  };
}

/**
 * Register a contribution (contribution-slots-spec §14): id collision throws
 * synchronously AT this call site (no accumulate-then-flush frame), unless
 * the exact same def is re-registering (a benign idempotent re-import).
 */
export function registerContribution<S extends string>(
  def: ContributionDefinition<S>,
): void {
  const existing = contributions.get(def.id);
  if (existing !== undefined) {
    if (existing.def === (def as AnyContribution)) return;
    throw new Error(
      `Contribution id "${def.id}" is already registered for slot "${existing.def.contributes}"; ` +
        `cannot re-register for "${def.contributes}". Contribution ids must be globally unique ` +
        `(use defineUplinkClient(...).registerContribution to auto-namespace by owner).`,
    );
  }
  logger.info(`REGISTERED contribution ${def.id} -> ${def.contributes}`);
  contributions.set(def.id, {
    def: def as AnyContribution,
    order: registrationCounter++,
  });
  notifyContributionChange();
}

export function getContributionsForSlot(slot: string): AnyContribution[] {
  return Array.from(contributions.values())
    .filter((entry) => entry.def.contributes === slot)
    .sort((a, b) => {
      const pa = a.def.priority ?? 0;
      const pb = b.def.priority ?? 0;
      if (pa !== pb) return pa - pb;
      return a.order - b.order;
    })
    .map((entry) => entry.def);
}

export function getContributionSettings(
  slot: string,
): NamespacedAugmentSettings[] {
  return getContributionsForSlot(slot)
    .filter((def) => def.settings && def.settings.length > 0)
    .map((def) => ({
      augmentId: def.id,
      namespace: def.id,
      fields: def.settings ?? [],
    }));
}

/** For use in tests only, resets the contribution registry to empty. */
export function clearContributions(): void {
  contributions.clear();
  registrationCounter = 0;
  notifyContributionChange();
}
