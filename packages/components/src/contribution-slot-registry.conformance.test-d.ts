// ---------------------------------------------------------------------------
// Drift guard for WIDGET-LED slots only: the `@ksp-gonogo/sitrep-sdk`
// `ContributionRegistry` MIRROR (`mod/sitrep-sdk/src/api/
// contribution-slots.ts`) vs core's real `ContributionRegistry`
// (`packages/core/src/contributions.ts`).
//
// Same reasoning as `slot-registry.conformance.test-d.ts`'s own header: the
// sdk leaf cannot import `@ksp-gonogo/components` or `@ksp-gonogo/core`
// (would form a turbo `^build` cycle, components and core both already
// depend on the sdk), so a widget-led slot's sdk declaration is a
// hand-mirrored duplicate of the widget's own, kept honest here.
//
// COMPONENT-LED slots (`filters.ResourceOpsUnit` and kin) never appear in this
// file: they have exactly one declaration (the GENERATED
// `mod/sitrep-sdk/src/__generated__/contribution-slots.gen.ts`, resolved
// through sdk-owned seams), so there is no second copy to drift and nothing
// to conformance-check. Migrating a widget-led slot onto a reusable
// slot-bearing component deletes its section here.
// ---------------------------------------------------------------------------

import type { ContributionEntry as CoreContributionEntry } from "@ksp-gonogo/core";
import type { ContributionEntry as SdkContributionEntry } from "@ksp-gonogo/sitrep-sdk";
import type { ShipMapPartMetaEntry, ShipMapPartMeterEntry } from "./ShipMap";

type Assignable<A, B> = A extends B ? true : false;
type Expect<T extends true> = T;

// --- ship-map.part-meters: checked both directions -------------------------

type _ShipMapPartMeters = Expect<
  Assignable<
    SdkContributionEntry<"ship-map.part-meters">,
    CoreContributionEntry<"ship-map.part-meters">
  >
>;
type _ShipMapPartMetersBack = Expect<
  Assignable<
    CoreContributionEntry<"ship-map.part-meters">,
    SdkContributionEntry<"ship-map.part-meters">
  >
>;
type _ShipMapPartMetersReal = Expect<
  Assignable<
    SdkContributionEntry<"ship-map.part-meters">,
    ShipMapPartMeterEntry
  >
>;
type _ShipMapPartMetersRealBack = Expect<
  Assignable<
    ShipMapPartMeterEntry,
    SdkContributionEntry<"ship-map.part-meters">
  >
>;

// --- ship-map.part-meta: checked both directions ----------------------------

type _ShipMapPartMeta = Expect<
  Assignable<
    SdkContributionEntry<"ship-map.part-meta">,
    CoreContributionEntry<"ship-map.part-meta">
  >
>;
type _ShipMapPartMetaBack = Expect<
  Assignable<
    CoreContributionEntry<"ship-map.part-meta">,
    SdkContributionEntry<"ship-map.part-meta">
  >
>;
type _ShipMapPartMetaReal = Expect<
  Assignable<SdkContributionEntry<"ship-map.part-meta">, ShipMapPartMetaEntry>
>;
type _ShipMapPartMetaRealBack = Expect<
  Assignable<ShipMapPartMetaEntry, SdkContributionEntry<"ship-map.part-meta">>
>;

// Keep every alias "used" under noUnusedLocals.
export type _ContributionRegistryConformance = [
  _ShipMapPartMeters,
  _ShipMapPartMetersBack,
  _ShipMapPartMetersReal,
  _ShipMapPartMetersRealBack,
  _ShipMapPartMeta,
  _ShipMapPartMetaBack,
  _ShipMapPartMetaReal,
  _ShipMapPartMetaRealBack,
];
