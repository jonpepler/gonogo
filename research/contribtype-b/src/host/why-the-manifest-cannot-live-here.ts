// ---------------------------------------------------------------------------
// A slot sealed from an APP-SIDE package, to demonstrate why the manifest has to
// live in the sdk.
//
// This augmentation is perfectly valid, and inside this program the key it
// declares is a fully typed slot id (see the assertion at the bottom). A
// facade-sealed contributor never sees it: an augmentation only exists in a
// program that contains the file carrying it, and a contributor's program
// contains the sdk and ui-kit, not this package. `src/contributor/negatives.ts`
// asserts the resulting compile error from the other side.
//
// Same constraint the existing `ContributionRegistry` mirror already lives
// under (`mod/sitrep-sdk/src/api/contribution-slots.ts`), stated as a test.
// ---------------------------------------------------------------------------

import type { EntryForKey, FilterEntry, KerbalismOpsUnit } from "../sdk";

declare module "../sdk/types" {
  interface WidgetSlotManifest {
    "kerbalism-ops": {
      filter: "crew";
    };
  }
}

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

/** Inside THIS program the seal works exactly as the generated one does. */
export type _HostSideSealResolves = Expect<
  Eq<EntryForKey<"kerbalism-ops.filter.crew">, FilterEntry<KerbalismOpsUnit>>
>;
