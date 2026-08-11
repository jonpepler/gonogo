// ---------------------------------------------------------------------------
// Component-led contribution slots: the KIND registry.
//
// A reusable component (mostly ui-kit) that renders contributed data declares
// its slot kind here, once, at module load: the same passive self-registration
// idiom as `registerComponent` / `registerUnit`. The registration is pure
// data: no component reference, no render callback. Rendering stays entirely
// inside the component itself, which reads its own slot with
// `useContributionSlot` (contributionsRuntime.tsx) wherever it happens to be
// mounted.
//
// The kind's contract with the rest of the system is the ADDRESS it mints:
// mounting a slot-bearing component inside widget `W` makes the slot
// `W.<kind>` live, exactly the shape the automatic `${componentId}.badges`
// slot already has (useWidgetBadges.ts): this module generalises that
// hardcoded special case into a first-class registration.
// ---------------------------------------------------------------------------

/**
 * A slot kind's registration handle. The component keeps this and hands it to
 * `useContributionSlot`; nothing else ever constructs one. `Entry` is the
 * phantom entry type the kind's contributions carry (`FilterEntry<unknown>`,
 * `BadgeEntry`, ...), so a component's own read is typed without a cast at
 * the call site.
 */
export interface ContributionSlotKindHandle<
  K extends string = string,
  // biome-ignore lint/correctness/noUnusedVariables: phantom, read by useContributionSlot's return type
  Entry = Record<string, unknown>,
> {
  /** The `<slotKind>` segment of every slot this kind mints. */
  readonly kind: K;
}

export interface ContributionSlotKindDefinition<K extends string = string> {
  /**
   * The second segment of the minted slot id (`<widgetId>.<kind>`). Must not
   * contain `.`: the slot id namespace is two-segment, same as every
   * hand-declared slot (`ship-map.part-meters`).
   */
  kind: K;
  /** Human name for debug and future dev-site surfaces. */
  name: string;
  /** What one contributed entry means, for the same surfaces. */
  description?: string;
}

const kinds = new Map<string, ContributionSlotKindDefinition>();

/**
 * Declare a slot kind. Called at module load from the slot-bearing
 * component's own file; the returned handle is what the component renders
 * from. Kind ids are globally unique: the minted `<widgetId>.<kind>`
 * addresses live in the same flat namespace as widget-declared slots, so two
 * components claiming one kind would silently pool their contributions.
 */
export function registerContributionSlotKind<
  Entry = Record<string, unknown>,
  const K extends string = string,
>(
  def: ContributionSlotKindDefinition<K>,
): ContributionSlotKindHandle<K, Entry> {
  if (def.kind.includes(".")) {
    throw new Error(
      `Contribution slot kind "${def.kind}" must not contain "."; the minted ` +
        `slot id is "<widgetId>.<kind>" and extra segments would break that shape.`,
    );
  }
  const existing = kinds.get(def.kind);
  if (existing !== undefined && existing !== def) {
    throw new Error(
      `Contribution slot kind "${def.kind}" is already registered ` +
        `("${existing.name}"); kind ids mint widget-scoped slot addresses and ` +
        `must be globally unique.`,
    );
  }
  kinds.set(def.kind, def);
  return { kind: def.kind };
}

/** Every registered kind, for debug and dev-site surfaces. */
export function getContributionSlotKinds(): readonly ContributionSlotKindDefinition[] {
  return Array.from(kinds.values());
}

/** For use in tests only, resets the kind registry to empty. */
export function clearContributionSlotKinds(): void {
  kinds.clear();
}
