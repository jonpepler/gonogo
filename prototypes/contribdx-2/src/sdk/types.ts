// ---------------------------------------------------------------------------
// Stands for `mod/sitrep-sdk/src/api/types.ts`, the facade leaf. Everything a
// SEALED contributor's program can reach lives under `src/sdk/`.
//
// Existing shapes (`FilterEntry`, `ContributionRegistry`, `ContributionEntry`,
// `ContributionTopics`, `registerContribution`) are mirrors of the real ones,
// trimmed only where the trim is irrelevant to the slot machinery
// (`TopicPayload` resolution is `unknown` here; owner stamping and settings
// are dropped). `registerContribution`'s runtime lives here rather than in
// `src/core` purely so the sealed tsconfig has a callable to compile; in the
// real tree the runtime stays in core and the sdk keeps its existing facade.
//
// NEW in this prototype, proposed for the real file:
//   SlotKindEntries<Row>  kind -> entry-shape seam, owned by the component
//   SlotKind              the union of declared kinds
//   SlotOf<K, Row, T>     the one-line mirror value for a component-led slot
// ---------------------------------------------------------------------------

export type FilterSelection = "single" | "multi";

/** Mirrors the real `FilterEntry<T>` (sdk `api/types.ts`). */
export interface FilterEntry<T> {
  id: string;
  label: string;
  group?: string;
  groupLabel?: string;
  selection?: FilterSelection;
  /** True to KEEP the item. */
  predicate: (item: T) => boolean;
}

/** Mirrors `ShipMapPartMeterEntry` (sdk `api/contribution-slots.ts`). */
export interface PartMeterEntry {
  partId: string;
  resource: string;
  displayName: string;
  amount: number;
  capacity: number;
  status?: "low" | "critical" | null;
}

// ── NEW seam: slot kinds, owned by the slot-bearing component ──────────────

/**
 * kind -> the entry shape that kind's component renders, over the host
 * widget's row type `Row`. First-party kinds sit in this base declaration
 * (the sdk already owns their entry types: `FilterEntry` is right above); an
 * Uplink-owned kind merges its member in from the Uplink's own package, the
 * same way Uplink-owned slots already merge into `ContributionRegistry`.
 *
 * A kind whose entries do not run against the host's rows (meters carry
 * their own part identity) simply ignores `Row`.
 */
export interface SlotKindEntries<Row> {
  /** ui-kit `FilterBar` + core `useContributedFilters`: contributed facet axes. */
  filters: FilterEntry<Row>;
  /** Per-part resource meters (the `ship-map.part-meters` shape, as a kind). */
  meters: PartMeterEntry;
}

/** Union of every declared slot kind. */
export type SlotKind = keyof SlotKindEntries<unknown> & string;

/**
 * The one-line mirror value for a component-led slot: states the kind, the
 * host's row type, and the topic union, and RESOLVES the entry shape through
 * the component's own `SlotKindEntries` member. The line cannot misstate the
 * entry shape (compare today's hand-written `{ entry: FilterEntry<...>;
 * topics: ... }`, which can), and when the component's entry type evolves,
 * every slot line picks the change up with no edit.
 *
 * `kind` is carried at runtime-shape level too so a key-grammar ratchet and
 * the future dev-site can read a slot's kind straight off the registry type.
 */
export type SlotOf<K extends SlotKind, Row, Topics extends string = never> = {
  kind: K;
  entry: SlotKindEntries<Row>[K];
  topics: Topics;
};

// ── Existing registry seam (mirror of the real one, unchanged) ─────────────

// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam, mirrors the real sdk
export interface ContributionRegistry {}

export type ContributionSlotId = keyof ContributionRegistry & string;

/** The entry shape a slot renders. Falls back loose for an undeclared id. */
export type ContributionEntry<S extends string> =
  S extends keyof ContributionRegistry
    ? ContributionRegistry[S] extends { entry: infer E }
      ? E
      : Record<string, unknown>
    : Record<string, unknown>;

type DeclaredTopicUnion<S extends string> = S extends keyof ContributionRegistry
  ? ContributionRegistry[S] extends { topics: infer T extends string }
    ? T
    : never
  : never;

/** Declared topics keyed precisely, open tail for processor ids: mirrors the real shape. */
export type ContributionTopics<S extends string> = {
  readonly [K in DeclaredTopicUnion<S>]: unknown;
} & Record<string, unknown>;

// ── registerContribution (mirror: same fields, same open `S extends string`) ─

export interface ContributionDefinition<S extends string = string> {
  id: string;
  contributes: S;
  deps?: readonly string[];
  compute: (
    topics: ContributionTopics<S>,
  ) => readonly ContributionEntry<S>[] | null | undefined;
  requires?: string;
  priority?: number;
}

export type AnyContribution = ContributionDefinition<string>;

const contributions = new Map<
  string,
  { def: AnyContribution; order: number }
>();
let registrationCounter = 0;
const listeners = new Set<() => void>();

export function onContributionsChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function registerContribution<S extends string>(
  def: ContributionDefinition<S>,
): void {
  const existing = contributions.get(def.id);
  if (existing !== undefined) {
    if (existing.def === (def as AnyContribution)) return;
    throw new Error(`Contribution id "${def.id}" is already registered`);
  }
  contributions.set(def.id, {
    def: def as AnyContribution,
    order: registrationCounter++,
  });
  for (const cb of listeners) cb();
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

/** Test-only reset, mirrors the real `clearContributions`. */
export function clearContributions(): void {
  contributions.clear();
  registrationCounter = 0;
  for (const cb of listeners) cb();
}
