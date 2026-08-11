import { logger } from "@ksp-gonogo/logger";
import type { Dep } from "@ksp-gonogo/sitrep-client";
import type {
  ComponentSlotId,
  ComponentSlotRecord,
  ContributionRegistry as SdkContributionRegistry,
  TopicId,
  TopicPayload,
} from "@ksp-gonogo/sitrep-sdk";
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

/**
 * Union of every declared in-tree contribution slot id: core's own registry
 * (widget-led slots, merged from widget files), the sdk leaf's registry
 * (their facade mirrors), and the DERIVED component-led ids
 * (`<segment>.<rowsName>`, the sdk's `ComponentSlotId`, computed from the
 * `SlotSegmentEntries` x `ContributionRows` seams with no per-slot
 * declaration anywhere). Everything resolves on the sdk leaf, so in-repo and
 * facade-sealed contributors see identical types.
 */
export type ContributionSlotId =
  | keyof ContributionRegistry
  | keyof SdkContributionRegistry
  | ComponentSlotId;

/** A slot's registry record: core's declaration wins, then the sdk's, then
 *  the derived component-led record. */
type ContributionSlotRecord<S extends string> =
  S extends keyof ContributionRegistry
    ? ContributionRegistry[S]
    : S extends keyof SdkContributionRegistry
      ? SdkContributionRegistry[S]
      : ComponentSlotRecord<S>;

/** The entry shape a slot renders. Falls back to a loose record for an out-of-repo slot id. */
export type ContributionEntry<S extends string> = S extends string
  ? [ContributionSlotRecord<S>] extends [never]
    ? Record<string, unknown>
    : ContributionSlotRecord<S> extends { entry: infer E }
      ? E
      : Record<string, unknown>
  : never;

type DeclaredTopicUnion<S extends string> = S extends string
  ? [ContributionSlotRecord<S>] extends [never]
    ? never
    : ContributionSlotRecord<S> extends { topics: infer T extends string }
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
  /**
   * Confine this contribution to slots hosted by ONE widget (a registered
   * ComponentDefinition id). A component-led slot (`filters.ResourceOpsUnit`)
   * is live in EVERY widget that renders its component over those rows, which
   * is the right default: the rows fully determine the entry type, so the
   * contribution is valid wherever they appear. When a facet genuinely
   * belongs to one widget's instance of the component anyway, name that
   * widget here; the per-widget aggregator skips the contribution everywhere
   * else. A runtime filter rather than a key form, deliberately: the hosting
   * widget changes only WHERE entries land, never what type they are, and a
   * three-segment widget-qualified key would need exactly the
   * widget-to-component link that is only forged in JSX. Harmless on a
   * widget-led slot (those ids are already unique to their widget).
   */
  onlyIn?: string;
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
