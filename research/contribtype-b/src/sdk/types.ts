// ---------------------------------------------------------------------------
// The facade's type core. Everything a facade-sealed contributor can see about
// contribution slots lives here or in a file this one is augmented from.
//
// Three registries, because a slot id has three parts and each part has a
// different rightful owner:
//
//   componentId  -> SlotComponentRegistry, merged by the COMPONENT's own module
//                   (ui-kit). Owns the ENTRY SHAPE, generically, once, forever.
//   widgetId     -> WidgetRegistry, merged by the sdk's widget mirror. Owns the
//                   SUBJECT (the widget's row/part type) and the topics its
//                   slots may read. One line per widget, not per slot.
//   instanceName -> WidgetSlotManifest, OPTIONAL. Seals a slot's instance names
//                   so the compiler knows the slot exists. Generated, and a
//                   slot works without it.
//
// The point of the split: nothing is ever declared per slot INSTANCE except the
// optional seal, and no entry type is ever duplicated.
// ---------------------------------------------------------------------------

// --- type-level function application ---------------------------------------

/**
 * A defunctionalised type-level function: how a component says "my entry shape
 * is `FilterEntry<X>` for whatever X the widget turns out to be" without TS
 * having higher-kinded types. The component extends this and writes `entry` in
 * terms of `this["subject"]`; `ApplyEntry` substitutes.
 */
export interface EntryFn {
  readonly subject: unknown;
  readonly entry: unknown;
}

/** Instantiate a component's entry shape at a concrete subject type. */
export type ApplyEntry<F extends EntryFn, S> = (F & {
  readonly subject: S;
})["entry"];

// --- the three registries ---------------------------------------------------

/**
 * componentId -> the component's `EntryFn`. Merged by the component's own
 * module, so the entry shape is declared exactly once by whoever owns it.
 *
 * Reachability: an augmentation is only in a contributor's program if some file
 * it imports carries it. That works out on its own here, because a contributor
 * has to import the component to name it, and importing the component loads the
 * module that carries its declaration. Naming what you target IS the import.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam
export interface SlotComponentRegistry {}

export type SlotComponentId = keyof SlotComponentRegistry & string;

/**
 * widgetId -> what the widget's slots operate on. One line per widget: the
 * subject its slot components see, and the topics a contribution may read.
 * This is the only thing the widget half costs, and it is per WIDGET, so
 * adding, renaming or removing a slot instance never touches it.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam
export interface WidgetRegistry {}

export type WidgetId = keyof WidgetRegistry & string;

export type SubjectOf<W extends string> = W extends keyof WidgetRegistry
  ? WidgetRegistry[W] extends { subject: infer S }
    ? S
    : unknown
  : unknown;

export type TopicsOf<W extends string> = W extends keyof WidgetRegistry
  ? WidgetRegistry[W] extends { topics: infer T extends string }
    ? T
    : never
  : never;

/**
 * widgetId -> componentId -> the instance names that widget mounts. Optional
 * per slot: a slot with no entry here still works, it is just addressed through
 * `slot(...)` rather than as a bare literal. Promoting a slot into this
 * interface is the deliberate act of publishing it as API.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam
export interface WidgetSlotManifest {}

/**
 * VARIANT B's registry: subjectId -> the data shape a slot component operates on
 * and the topics that shape's data comes from. One line per SUBJECT, which is a
 * thing the sdk already mirrors, and nothing per widget or per instance.
 */
// biome-ignore lint/suspicious/noEmptyInterface: declaration-merging seam
export interface SubjectRegistry {}

export type SubjectId = keyof SubjectRegistry & string;

export type SubjectOfId<S extends string> = S extends keyof SubjectRegistry
  ? SubjectRegistry[S] extends { subject: infer T }
    ? T
    : unknown
  : unknown;

export type TopicsOfSubject<S extends string> = S extends keyof SubjectRegistry
  ? SubjectRegistry[S] extends { topics: infer T extends string }
    ? T
    : never
  : never;

/**
 * A subject named as a VALUE, so a widget passes `subject={ISRU_UNIT}` at the use
 * site and the id reaching the runtime is the same one the types checked.
 */
export interface SubjectToken<S extends SubjectId> {
  readonly subjectId: S;
}

export function subjectToken<S extends SubjectId>(id: S): SubjectToken<S> {
  return { subjectId: id };
}

/**
 * Every VARIANT B slot id, fully enumerated: the product of the components that
 * declared an entry shape and the subjects the sdk mirrors. No free segment, so
 * there is no typo to make, and no manifest to generate.
 */
export type ComponentSlotId = `${SlotComponentId}.${SubjectId}`;

/**
 * THE MIDDLE GROUND: a subject-keyed slot narrowed to one widget, written
 * `component.subject@widget`. Every part is still checked against a registry, so
 * narrowing costs no static safety, and it exists for the case where two widgets
 * over one subject genuinely want different facets (a full ops console and a
 * compact strip). Default to the unscoped key; reach for this only when the
 * broad contribution would be wrong rather than merely broad.
 */
export type WidgetScopedSlotId = `${ComponentSlotId}@${WidgetId}`;

/** The unscoped key behind a narrowed one, which is what resolves the types. */
export type StripWidgetScope<K extends string> =
  K extends `${infer B}@${string}` ? B : K;

// --- key algebra ------------------------------------------------------------

/** Every sealed slot id, composed from the manifest. */
export type SealedSlotId = {
  [W in keyof WidgetSlotManifest & string]: {
    [C in keyof WidgetSlotManifest[W] &
      string]: WidgetSlotManifest[W][C] extends infer N | undefined
      ? N extends string
        ? `${W}.${C}.${N}`
        : never
      : never;
  }[keyof WidgetSlotManifest[W] & string];
}[keyof WidgetSlotManifest & string];

declare const SLOT_REF: unique symbol;

/**
 * A slot id formed by `slot(...)`. The brand is what separates "a key I proved
 * the component and widget halves of" from an arbitrary string, so an
 * unchecked literal cannot reach `registerContribution` by accident.
 */
export type SlotRef<K extends string> = K & {
  readonly [SLOT_REF]: K;
};

/**
 * The plain key behind a target. A `SlotRef` is an intersection, and a
 * conditional type cannot pattern-match a template literal through one, so the
 * brand carries the key as a property to be inferred back out.
 */
export type KeyOfTarget<T> = T extends {
  readonly [SLOT_REF]: infer K extends string;
}
  ? K
  : T extends string
    ? T
    : never;

export type SlotTarget =
  | SealedSlotId
  | ComponentSlotId
  | WidgetScopedSlotId
  | SlotRef<string>;

/** The widget half of a slot id. */
export type WidgetOfKey<K extends string> =
  K extends `${infer W}.${string}.${string}` ? W : never;

/** The component half of a slot id. */
export type ComponentOfKey<K extends string> =
  K extends `${string}.${infer C}.${string}` ? C : never;

/**
 * The entry type a slot renders, resolved from the key alone: the key names the
 * component (which owns the entry shape) and the widget (which owns the
 * subject), so both modes of addressing resolve through one path.
 */
export type EntryOf<
  C extends SlotComponentId,
  S,
> = (SlotComponentRegistry[C] & {
  readonly subject: S;
})["entry"];

export type EntryForKey<K0 extends string> = EntryForUnscopedKey<
  StripWidgetScope<K0>
>;

type EntryForUnscopedKey<K extends string> =
  K extends `${infer W}.${infer C}.${string}`
    ? C extends SlotComponentId
      ? EntryOf<C, SubjectOf<W>>
      : never
    : K extends `${infer C}.${infer S}`
      ? C extends SlotComponentId
        ? S extends SubjectId
          ? EntryOf<C, SubjectOfId<S>>
          : never
        : never
      : never;

export type EntryForTarget<T extends SlotTarget> = EntryForKey<KeyOfTarget<T>>;

/** Topics come from the widget for a three-part key, the subject for a two-part. */
export type TopicsOfKey<K0 extends string> = TopicsOfUnscopedKey<
  StripWidgetScope<K0>
>;

type TopicsOfUnscopedKey<K extends string> =
  K extends `${infer W}.${string}.${string}`
    ? TopicsOf<W>
    : K extends `${string}.${infer S}`
      ? TopicsOfSubject<S>
      : never;

export type TopicsForTarget<T extends SlotTarget> = {
  readonly [K in TopicsOfKey<KeyOfTarget<T>>]?: unknown;
};

// --- addressing a slot ------------------------------------------------------

/**
 * Address a slot by the component you are extending, the widget you are
 * extending it in, and the instance name. The component argument is the
 * component itself, so the import that names it is also what brings its entry
 * declaration into your program.
 *
 * `W extends WidgetId` and `C extends SlotComponentId` mean a wrong widget or a
 * wrong component is a compile error. The instance name is a free literal: the
 * type system cannot see a widget's JSX (proved in `spike/jsx-expression-type`),
 * so this is the one part checked at runtime instead.
 */
export function slot<
  C extends SlotComponentId,
  W extends WidgetId,
  const N extends string,
>(
  component: { readonly componentId: C },
  widget: W,
  name: N,
): SlotRef<`${W}.${C}.${N}`> {
  return `${widget}.${component.componentId}.${name}` as SlotRef<`${W}.${C}.${N}`>;
}

/**
 * VARIANT B's addressing: the component you are extending and the subject you are
 * extending it for. Both arguments are checked against declared registries, so
 * unlike `slot(...)` there is no unchecked segment at all.
 */
export function componentSlot<C extends SlotComponentId, S extends SubjectId>(
  component: { readonly componentId: C },
  subject: SubjectToken<S>,
): SlotRef<`${C}.${S}`> {
  return `${component.componentId}.${subject.subjectId}` as SlotRef<`${C}.${S}`>;
}

/** Narrow a subject-keyed slot to one widget. See {@link WidgetScopedSlotId}. */
export function inWidget<K extends ComponentSlotId, W extends WidgetId>(
  slotId: K | SlotRef<K>,
  widget: W,
): SlotRef<`${K}@${W}`> {
  return `${slotId as K}@${widget}` as SlotRef<`${K}@${W}`>;
}

// --- the contribution itself ------------------------------------------------

export interface ContributionDefinition<T extends SlotTarget> {
  /** Globally unique, namespaced by owner in the real registry. */
  id: string;
  /** The slot this feeds: a sealed literal, or a `slot(...)` reference. */
  contributes: T;
  /** Pure. Entry type is the component's, at the widget's subject. */
  compute: (
    topics: TopicsForTarget<T>,
  ) => readonly EntryForTarget<T>[] | null | undefined;
  requires?: string;
  priority?: number;
}

/**
 * The registry's own view: erased, because a host reading every contribution
 * must not re-resolve `EntryForTarget` across the whole `SlotTarget` union (that
 * distributes into a type instantiation TS refuses outright). The precise types
 * are for the CONTRIBUTOR's call site; the host re-narrows per slot component.
 */
export interface AnyContribution {
  id: string;
  contributes: string;
  compute: (
    topics: Record<string, unknown>,
  ) => readonly unknown[] | null | undefined;
  requires?: string;
  priority?: number;
}

const contributions = new Map<string, AnyContribution>();

export function registerContribution<T extends SlotTarget>(
  def: ContributionDefinition<T>,
): void {
  contributions.set(def.id, def as unknown as AnyContribution);
}

export function getContributionsForSlot(slotId: string): AnyContribution[] {
  return Array.from(contributions.values()).filter(
    (def) => def.contributes === slotId,
  );
}

export function getRegisteredContributionTargets(): string[] {
  return Array.from(contributions.values(), (def) => def.contributes);
}
