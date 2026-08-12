// Type-level proof that `ScienceExperimentRow`'s presentational
// `ScienceInstrument` contract is a real, structural projection of the SDK's
// wire type for the `science.instruments` topic: not a coincidentally
// similar shape. Enforced by `tsc` (the package `typecheck` script runs this
// via `tsconfig.test-d.json`), matching the SDK's own `topics.test-d.ts`
// decision (type-level tests don't belong in the vitest runner).
//
// `WireInstrument` (`InstrumentEntry`) is all-optional (wire uncertainty);
// `ScienceInstrument` is the normalised, already-parsed shape a widget hands
// down after its own `parseInstruments`. Two fields are renamed on the wire
// (`hasData` <- `dataIsCollectable`; `partTitle`/`expId` <- `partName`/
// `experimentId`, checked by the widget's own parser tests, not here), this
// file checks the fields that keep their name, plus the renamed `hasData`,
// each has a compatible (optional-widened) counterpart on the wire type.

import type { ScienceInstrument, WireInstrument } from "./ScienceExperimentRow";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

type _PartIdCompatible = Expect<
  Equal<NonNullable<WireInstrument["partId"]>, ScienceInstrument["partId"]>
>;
type _DeployedCompatible = Expect<
  Equal<NonNullable<WireInstrument["deployed"]>, ScienceInstrument["deployed"]>
>;
type _InoperableCompatible = Expect<
  Equal<
    NonNullable<WireInstrument["inoperable"]>,
    ScienceInstrument["inoperable"]
  >
>;
// `WireInstrument["rerunnable"]`'s generated type is `boolean | undefined`:
// reinforced-typings maps C#'s `bool?` to a plain optional boolean, with no
// `| null` in the STATIC type even though the field genuinely arrives `null`
// at runtime (a provider whose running state is a state machine rather than
// a cfg flag reports "unknown" that way, see `ScienceInstrument`'s own doc
// comment). So this check compares the underlying boolean-ness only, the
// widest claim the wire's static type can honestly make; the null-preserving
// half of the contract is proven at runtime instead, by
// `ScienceOfficer`'s `parseInstruments` tests and
// `ScienceExperimentRow.test.tsx`'s own null-vs-false-ONE-SHOT assertions.
type _RerunnableCompatible = Expect<
  Equal<
    NonNullable<WireInstrument["rerunnable"]>,
    NonNullable<ScienceInstrument["rerunnable"]>
  >
>;
// `hasData` maps onto the wire's `dataIsCollectable` (see the widget's
// `parseInstruments` doc comment): different name, same boolean shape.
type _HasDataCompatible = Expect<
  Equal<
    NonNullable<WireInstrument["dataIsCollectable"]>,
    ScienceInstrument["hasData"]
  >
>;
