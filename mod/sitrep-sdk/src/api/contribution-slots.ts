// ---------------------------------------------------------------------------
// Contribution-registry mirror: the `ContributionRegistry` declaration-merge
// for every first-party (packages/components-owned) contribution slot,
// carried by the sdk leaf itself. Same reasoning, same file-identity caveat,
// same "components-owned only, Uplink-owned slots stay in the Uplink's own
// file" scope split as `slots.ts` (see that file's header for the long
// form).
//
// Merges into the `ContributionRegistry {}` base declared in `./types.ts`,
// exactly like `slots.ts` merges into that file's `SlotRegistry {}` base: TS
// module augmentation with a relative specifier only attaches to an EXISTING
// export of the target module (an augmentation of a name types.ts hasn't
// declared is instead treated as a brand new ambient module declaration,
// which TS rejects outright for a relative path), so the base interface has
// to live in types.ts itself even while it stays empty.
//
// The `export {}` below is load-bearing, not decorative: it is what makes
// this FILE a module in TS's eyes. `slots.ts` gets that status for free from
// its own top-level `export interface` declarations (its real slot context
// types); this scaffold has no such content yet, so without an explicit
// export TS would treat it as a global script and reject the relative
// `declare module` specifier below with "Ambient module declaration cannot
// specify relative module name". Drop this line once the first real
// contribution slot's context type gives the file a natural export.
//
// The first two first-party contribution slots landed here (spec §13.4, the
// framework's self-contribution flagship): ShipMap's `ship-map.part-meters`
// and `ship-map.part-meta`, both owned by `packages/components/src/ShipMap`.
// Every OTHER first-party contribution to date rides the automatic
// `${componentId}.badges` slot, which is a runtime string, never a member of
// this declaration-merged registry (see `useWidgetBadges`'s own doc
// comment); these two are the first GENUINELY typed, declared slots.
//
// `MeterTone` is duplicated rather than imported from `@ksp-gonogo/ui-kit`:
// ui-kit's own `Meter.tsx` imports `value` from this package, so importing
// ui-kit back here would be the exact same leaf-cycle this file's header
// (and `./slots.ts`'s) already explains for `@ksp-gonogo/components`.
// ---------------------------------------------------------------------------

/** Mirrors ui-kit's `MeterTone` (`packages/ui-kit/src/Meter.tsx`). */
export type ShipMapMeterTone = "neutral" | "go" | "warn" | "nogo" | "info";

/** Mirrors `ShipMapPartMeterEntry` (`ShipMap/shipTopology.ts`). */
export interface ShipMapPartMeterEntry {
  partId: string;
  resource: string;
  displayName: string;
  amount: number;
  capacity: number;
  tone: ShipMapMeterTone;
}

/** Mirrors `ShipMapPartMetaEntry` (`ShipMap/shipTopology.ts`). */
export interface ShipMapPartMetaEntry {
  partId: string;
  label: string;
  tone: ShipMapMeterTone;
  kind: "ratio" | "text";
  value?: number;
  text?: string;
}

declare module "./types" {
  interface ContributionRegistry {
    "ship-map.part-meters": {
      entry: ShipMapPartMeterEntry;
      topics: "vessel.parts" | "kerbalism.profile";
    };
    "ship-map.part-meta": {
      entry: ShipMapPartMetaEntry;
      topics: "kerbalism.lifesupport" | "kerbalism.profile";
    };
  }
}
