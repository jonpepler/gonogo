// ---------------------------------------------------------------------------
// The half that proves the typing is real: every `@ts-expect-error` below is an
// assertion that the line under it DOES fail to compile. If any of these ever
// started compiling, this file goes red, so the guarantees cannot rot quietly.
//
// The last section is the honest one: the single mistake this pattern does NOT
// catch at compile time, spelled out rather than glossed over.
// ---------------------------------------------------------------------------

import { registerContribution, slot } from "@ksp-gonogo/sitrep-sdk";
import { Filter, MeterList } from "@ksp-gonogo/ui-kit";

// --- 1. a sealed slot that does not exist ----------------------------------

registerContribution({
  id: "bad:no-such-slot",
  // @ts-expect-error "wibble" is not an instance name ResourceOps mounts
  contributes: "resource-ops.filter.wibble",
  compute: () => [],
});

// --- 2. a slot on a widget that does not exist ------------------------------

registerContribution({
  id: "bad:no-such-widget",
  // @ts-expect-error there is no `resourceops` widget
  contributes: "resourceops.filter.process",
  compute: () => [],
});

// --- 3. a raw string, bypassing the machinery -------------------------------
//
// An unsealed slot cannot be reached by guessing its id. Either seal it, or
// address it through `slot(...)`, which checks the two parts it can.

registerContribution({
  id: "bad:raw-string",
  // @ts-expect-error a plausible but unsealed id is still not a SlotTarget
  contributes: "kerbalism-ops.filter.crew",
  compute: () => [],
});

// --- 4. the wrong entry shape for the slot's component ----------------------

registerContribution({
  id: "bad:missing-predicate",
  contributes: "resource-ops.filter.process",
  // @ts-expect-error a FilterEntry without a predicate is not a FilterEntry
  compute: () => [{ id: "x", label: "X" }],
});

registerContribution({
  id: "bad:meter-entry-in-filter-slot",
  contributes: "resource-ops.filter.process",
  compute: () => [
    // @ts-expect-error MeterEntry's shape is not what a filter slot renders
    { id: "x", label: "X", amount: 1, capacity: 2, belongsTo: () => true },
  ],
});

// --- 5. the wrong SUBJECT, i.e. the wrong widget's rows ---------------------
//
// The entry shape is the component's, instantiated at the WIDGET's subject, so
// a predicate written against another widget's rows is caught.

registerContribution({
  id: "bad:wrong-subject",
  contributes: "resource-ops.filter.process",
  compute: () => [
    {
      id: "x",
      label: "X",
      // @ts-expect-error ResourceOpsUnit has no `partId`; that is ShipMap's subject
      predicate: (item) => item.partId === "hab-1",
    },
  ],
});

registerContribution({
  id: "bad:wrong-subject-meter",
  contributes: "ship-map.meter.supplies",
  compute: () => [
    {
      id: "x",
      label: "X",
      amount: 1,
      capacity: 2,
      // @ts-expect-error ShipMapPart has no `kind`; that is ResourceOps's subject
      belongsTo: (part) => part.kind === "drill",
    },
  ],
});

// --- 6. `slot(...)`: the widget half is checked ------------------------------

// @ts-expect-error `resourceops` is not a registered widget id
slot(Filter, "resourceops", "process");

// --- 7. `slot(...)`: the component half is checked --------------------------

const notASlotComponent = { componentId: "sparkline" } as const;
// @ts-expect-error no component called `sparkline` declared an entry shape
slot(notASlotComponent, "resource-ops", "process");

// --- 8. `slot(...)` still checks the entry ----------------------------------

registerContribution({
  id: "bad:unsealed-wrong-entry",
  contributes: slot(Filter, "kerbalism-ops", "crew"),
  // @ts-expect-error KerbalismOpsUnit has no `kind`
  compute: () => [{ id: "x", label: "X", predicate: (i) => i.kind === "a" }],
});

// --- 9. the facade boundary -------------------------------------------------
//
// `src/host/why-the-manifest-cannot-live-here.ts` seals
// `kerbalism-ops.filter.crew` from an app-side package, and inside that program
// the key resolves. From here it does not exist at all, which is the whole
// reason the manifest belongs in the sdk. Case 3 above is the same line failing;
// this comment is what makes it mean something.

// --- 10. THE GAP -----------------------------------------------------------
//
// A misspelled INSTANCE NAME on an unsealed slot compiles. It has to: the type
// system cannot see the widget's JSX (`spike/jsx-erases-the-brand.tsx`), so
// there is nothing to check "crw" against. Nothing below is expected to error,
// and that is the honest cost of the passive mode.
//
// What catches it instead: `findMisaddressedContributions()` reports this
// contribution at runtime, naming the slots `kerbalism-ops` DOES offer. Sealing
// the slot in the manifest promotes it to a compile error.

registerContribution({
  id: "gap:typo-in-instance-name",
  contributes: slot(Filter, "kerbalism-ops", "crw"),
  compute: () => [{ id: "x", label: "X", predicate: (item) => item.running }],
});

// A second instance name nobody mounts, via the other component, same story.
registerContribution({
  id: "gap:typo-in-instance-name-meter",
  contributes: slot(MeterList, "ship-map", "supples"),
  compute: () => [
    {
      id: "x",
      label: "X",
      amount: 1,
      capacity: 2,
      belongsTo: (part) => part.partId !== "",
    },
  ],
});
