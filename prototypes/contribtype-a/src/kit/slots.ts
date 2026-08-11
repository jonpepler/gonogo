// ---------------------------------------------------------------------------
// The machinery. In the real tree this file is `@ksp-gonogo/core`
// (`packages/core/src/contributions.ts`) plus the type half that has to live
// on the sdk leaf so a facade-sealed contributor can reach it.
//
// Two declaration-merge seams, and nothing else:
//
//   SlotKindEntries<Row>  a COMPONENT merges its own kind in (ui-kit's Filter
//                         says "kind `filter` contributes `FilterEntry<Row>`").
//                         Component-owned entry types, passively declared at
//                         module load, the type-level twin of `registerUnit`.
//
//   WidgetSlotManifests   a WIDGET OWNER merges its widget's slot manifest in,
//                         ONE entry per widget, whose value is `typeof` the
//                         object the widget already renders from. Adding a
//                         `<Filter name="x">` handle changes that type with no
//                         further edit anywhere, which is what makes the link
//                         passive.
//
// Every slot id, entry type and topic union is then COMPUTED off those two by
// mapped + template-literal types. There is no third list.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";

// ── Seam 1: component kinds ────────────────────────────────────────────────

/**
 * kindId -> the contribution entry type that kind accepts, over the host
 * widget's row type `Row`. A ui-kit component merges one member in from its
 * own file; a kind that does not care about the host's rows just ignores
 * `Row`.
 *
 * The type parameter name must be spelled `Row` in every merge: TS requires
 * identical type parameters across the declarations of one interface.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merge seam
// biome-ignore lint/correctness/noUnusedVariables: Row is used by merged members
export interface SlotKindEntries<Row> {}

/**
 * kindId -> the props the HOST passes when it renders that component. Also
 * component-owned, also merged from the component's own file, so the widget
 * gets a typed `<slots.process.Component …>` without the machinery knowing
 * anything about filters.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merge seam
// biome-ignore lint/correctness/noUnusedVariables: Row is used by merged members
export interface SlotKindProps<Row> {}

export type SlotKindId = keyof SlotKindEntries<unknown> & string;

// ── Seam 1b: row types by name ─────────────────────────────────────────────

/**
 * name -> a widget's row type. Merged by whoever owns the rows: the sdk for a
 * first-party widget's row union, the Uplink's own package for its own.
 *
 * A slot names its rows rather than closing over the type anonymously, for two
 * reasons. It lets a contribution target "every filter over THESE rows,
 * wherever it is mounted" and still be fully typed (see `BroadcastTarget`,
 * and the write-up's assessment of the drop-the-widget-id simplification). And
 * it gives a build step a machine-readable handle on the row type, which is
 * what an optional codegen would need to emit the first-party mirror.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merge seam
export interface RowTypes {}

export type RowName = keyof RowTypes & string;

// ── Slot specs: what a component's factory hands the widget ────────────────

/**
 * One declared slot instance, before it is bound to a widget. Produced only
 * by a component's own factory (`filterSlot<Row>()`), never written by hand.
 *
 * `__phantom` carries `Row` and the topic union at the type level; it is a
 * type-only field and is deliberately absent at runtime (the factories cast
 * it in), which is why every reader of it is a type, never a value.
 */
export interface SlotSpec<
  K extends string,
  Rows extends string,
  Topics extends string,
> {
  readonly kind: K;
  /** The name, in `RowTypes`, of the rows this slot's component runs against. */
  readonly rows: Rows;
  readonly topics: readonly Topics[];
  /** Renders this slot's component, bound to a resolved slot id by `defineSlots`. */
  readonly render: (slotId: string, props: unknown) => ReactElement | null;
  readonly __phantom: { topics: Topics };
}

export type AnySlotSpec = SlotSpec<string, string, string>;

type SpecKind<S> = S extends SlotSpec<infer K, string, string> ? K : never;
type SpecRows<S> = S extends SlotSpec<string, infer R, string> ? R : never;
type SpecRow<S> = SpecRows<S> extends RowName ? RowTypes[SpecRows<S>] : unknown;
type SpecTopics<S> = S extends SlotSpec<string, string, infer T> ? T : never;

/** The entry a component of kind `K` accepts over rows named `R`. */
export type EntryFor<K extends string, R extends RowName> = SlotKindEntries<
  RowTypes[R]
>[K & keyof SlotKindEntries<RowTypes[R]>];

/** The props the host passes to a spec's component, resolved through the kind seam. */
type SpecProps<S> = SlotKindProps<SpecRow<S>>[SpecKind<S> &
  keyof SlotKindProps<SpecRow<S>>];

/**
 * Helper for a component factory: build a spec without hand-writing the
 * phantom. The single cast in the codebase, and it is confined here.
 */
export function slotSpec<
  K extends SlotKindId,
  Rows extends RowName,
  Topics extends string,
>(
  kind: K,
  rows: Rows,
  topics: readonly Topics[],
  render: (slotId: string, props: unknown) => ReactElement | null,
): SlotSpec<K, Rows, Topics> {
  return { kind, rows, topics, render } as unknown as SlotSpec<K, Rows, Topics>;
}

// ── Handles: what the widget renders ───────────────────────────────────────

/** The composed slot id: widget . component . instance. */
export type SlotIdOf<
  W extends string,
  S,
  Name extends string,
> = `${W}.${SpecKind<S>}.${Name}`;

export interface SlotHandle<Id extends string, S> {
  /** The composed id, as a literal type. A contributor never types this by hand. */
  readonly slotId: Id;
  /** The component, already bound to this slot id. The widget renders THIS. */
  readonly Component: (props: SpecProps<S>) => ReactElement | null;
}

export interface WidgetSlots<
  W extends string,
  S extends Record<string, AnySlotSpec>,
> {
  readonly widgetId: W;
  readonly handles: {
    readonly [K in keyof S & string]: SlotHandle<SlotIdOf<W, S[K], K>, S[K]>;
  };
}

// ── Runtime registry ───────────────────────────────────────────────────────

export interface RegisteredSlot {
  slotId: string;
  widgetId: string;
  componentId: string;
  instanceName: string;
  rows: string;
  topics: readonly string[];
}

const slots = new Map<string, RegisteredSlot>();

/** Every slot any loaded widget declared. The dev-site docs surface reads this. */
export function getRegisteredSlots(): readonly RegisteredSlot[] {
  return Array.from(slots.values());
}

/**
 * Declare a widget's slot instances. Called at module load from the widget's
 * own file, alongside `registerComponent`, and returns the handles the widget
 * renders. There is no second list: the object passed here IS the render
 * surface, so a slot that exists cannot fail to be declared and a slot that is
 * declared cannot fail to be rendered without dead code.
 */
export function defineSlots<
  const W extends string,
  const S extends Record<string, AnySlotSpec>,
>(widgetId: W, specs: S): WidgetSlots<W, S> {
  const handles: Record<string, unknown> = {};
  for (const [instanceName, spec] of Object.entries(specs)) {
    const slotId = `${widgetId}.${spec.kind}.${instanceName}`;
    slots.set(slotId, {
      slotId,
      widgetId,
      componentId: spec.kind,
      instanceName,
      rows: spec.rows,
      topics: spec.topics,
    });
    handles[instanceName] = {
      slotId,
      Component: (props: unknown) => spec.render(slotId, props),
    };
  }
  return { widgetId, handles } as WidgetSlots<W, S>;
}

// ── Seam 2: widget manifests, and everything computed off them ─────────────
//
// (`defineDeclaredSlots`, the first-party variant of `defineSlots`, sits below
// the seam it reads from.)

/**
 * widgetId -> that widget's `typeof defineSlots(...)` result. Merged by
 * whoever owns the widget: an out-of-repo Uplink merges it from its own
 * package (fully inferred, zero maintenance); a first-party widget's entry is
 * mirrored on the sdk leaf, because a sealed contributor's compiler can only
 * see files reachable from `@ksp-gonogo/sitrep-sdk`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merge seam
export interface WidgetSlotManifests {}

type UnionToIntersection<U> = (
  U extends unknown
    ? (x: U) => void
    : never
) extends (x: infer I) => void
  ? I
  : never;

/** One widget manifest flattened into `slotId -> {entry, topics}`. */
type SlotsOf<M> =
  M extends WidgetSlots<infer W, infer S>
    ? {
        [K in keyof S & string as `${W}.${SpecKind<S[K]>}.${K}`]: {
          entry: SlotKindEntries<SpecRow<S[K]>>[SpecKind<S[K]> &
            keyof SlotKindEntries<SpecRow<S[K]>>];
          topics: SpecTopics<S[K]>;
        };
      }
    : never;

/**
 * The registry a contributor targets. Not merged directly by anyone: it is
 * derived from every declared manifest, which is the whole trick. A widget
 * adding an instance widens this with no edit here and no edit at the widget's
 * `registerComponent` call.
 */
export type ContributionRegistry = UnionToIntersection<
  {
    [W in keyof WidgetSlotManifests]: SlotsOf<WidgetSlotManifests[W]>;
  }[keyof WidgetSlotManifests]
>;

export type ContributionSlotId = keyof ContributionRegistry & string;

export type ContributionEntry<S extends ContributionSlotId> =
  ContributionRegistry[S] extends { entry: infer E } ? E : never;

export type ContributionTopics<S extends ContributionSlotId> =
  ContributionRegistry[S] extends { topics: infer T extends string }
    ? { readonly [K in T]: unknown }
    : Record<string, never>;

/** The spec map a widget whose manifest is already declared must supply. */
export type DeclaredSpecs<W extends keyof WidgetSlotManifests> =
  WidgetSlotManifests[W] extends WidgetSlots<string, infer S> ? S : never;

/**
 * `defineSlots` for a widget whose manifest is mirrored ahead of it (every
 * first-party widget, because the sdk leaf cannot import the package the
 * widget lives in). Identical at runtime; the difference is that the object
 * literal is checked against the declared manifest in BOTH directions, so a
 * new handle with no mirror entry, and a mirror entry with no handle, are each
 * a compile error naming the instance.
 */
export function defineDeclaredSlots<
  const W extends keyof WidgetSlotManifests & string,
>(widgetId: W, specs: DeclaredSpecs<W>): WidgetSlotManifests[W] {
  return defineSlots(
    widgetId,
    specs as unknown as Record<string, AnySlotSpec>,
  ) as unknown as WidgetSlotManifests[W];
}

// ── The contributor-facing call ────────────────────────────────────────────

/**
 * Hand one entry to the host. The second, optional way to write `compute`,
 * and the STRICTER one: an argument position keeps object-literal freshness,
 * so an entry carrying a field the component's entry type does not have is a
 * compile error here. Returning an array does not catch that one case (TS
 * infers a function's return type before checking it, which discards
 * freshness), though every other mismatch is caught either way. See
 * `src/contributor/violations.ts` cases 4 and 4b.
 */
export type Emit<S extends ContributionSlotId> = (
  entry: ContributionEntry<S>,
) => void;

export interface ContributionDefinition<S extends ContributionSlotId> {
  id: string;
  contributes: S;
  compute: (
    topics: ContributionTopics<S>,
    emit: Emit<S>,
    // biome-ignore lint/suspicious/noConfusingVoidType: an emit-only compute returns nothing, and `undefined` rejects a block-bodied arrow
  ) => readonly ContributionEntry<S>[] | void;
  requires?: string;
  priority?: number;
}

const contributions: ContributionDefinition<ContributionSlotId>[] = [];

export function registerContribution<const S extends ContributionSlotId>(
  def: ContributionDefinition<S>,
): void {
  contributions.push(def as ContributionDefinition<ContributionSlotId>);
}

// ── Broadcast contributions: component-scoped, not widget-scoped ───────────
//
// The operator's "accept a slot for ANY widget" idea, kept type-safe. A
// broadcast names a component KIND and a ROW TYPE rather than one slot, and
// reaches every slot of that kind over those rows in any widget, present or
// future. The row name is what saves it: a filter's whole payload is a
// predicate over the host's rows, so a target that names no row type can only
// hand a contributor `unknown` to predicate against, and dropping the widget
// id WITHOUT naming rows drops the typing that made the mechanism worth
// having. Naming the rows keeps both.

export interface BroadcastTarget<K extends SlotKindId, R extends RowName> {
  kind: K;
  rows: R;
}

export interface BroadcastContribution<
  K extends SlotKindId,
  R extends RowName,
> {
  id: string;
  contributes: BroadcastTarget<K, R>;
  compute: (
    topics: Record<string, unknown>,
    emit: (entry: EntryFor<K, R>) => void,
    // biome-ignore lint/suspicious/noConfusingVoidType: an emit-only compute returns nothing, and `undefined` rejects a block-bodied arrow
  ) => readonly EntryFor<K, R>[] | void;
  requires?: string;
  priority?: number;
}

const broadcasts: BroadcastContribution<SlotKindId, RowName>[] = [];

export function registerBroadcastContribution<
  const K extends SlotKindId,
  const R extends RowName,
>(def: BroadcastContribution<K, R>): void {
  broadcasts.push(def as unknown as BroadcastContribution<SlotKindId, RowName>);
}

/**
 * Everything feeding one slot: contributions addressed to it, plus every
 * broadcast whose kind and rows match. Matching is on the slot's REGISTERED
 * kind and row name, so a broadcast reaches a widget written after it with no
 * edit on either side.
 */
export function getContributionsForSlot(
  slot: string,
): readonly { id: string }[] {
  const registered = slots.get(slot);
  const direct = contributions.filter((c) => c.contributes === slot);
  if (!registered) return direct;
  const matching = broadcasts.filter(
    (b) =>
      b.contributes.kind === registered.componentId &&
      b.contributes.rows === registered.rows,
  );
  return [...direct, ...matching];
}
