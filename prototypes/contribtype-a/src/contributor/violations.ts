// ---------------------------------------------------------------------------
// The negative half of the proof. Every `@ts-expect-error` below is an
// assertion that the line under it DOES fail to compile: if the type machinery
// ever stops catching one of these, tsc reports "Unused '@ts-expect-error'
// directive" and this file goes red.
//
// `./verify.sh` also recompiles this tree with every suppression stripped, so
// the real diagnostics a contributor would see are printed rather than
// described.
// ---------------------------------------------------------------------------

import { type ContributionEntry, registerContribution } from "../sdk";

// 1. A slot that does not exist: the instance name is wrong.
registerContribution({
  id: "bad/nonexistent-instance",
  // @ts-expect-error "processes" is not an instance ResourceOps renders
  contributes: "resource-ops.filter.processes",
  compute: () => [],
});

// 2. A slot that does not exist: the widget is wrong.
registerContribution({
  id: "bad/nonexistent-widget",
  // @ts-expect-error no widget "resource-op" is registered
  contributes: "resource-op.filter.process",
  compute: () => [],
});

// 3. A slot that does not exist: right widget and instance, wrong component.
registerContribution({
  id: "bad/nonexistent-component",
  // @ts-expect-error ResourceOps mounts a filter under "process", not a meter
  contributes: "resource-ops.meter.process",
  compute: () => [],
});

// 4. THE ONE GAP, stated honestly. An EXTRA field on an entry returned as an
// array is NOT caught: TS infers a function's return type before checking it
// against the contextual type, and that inference discards object-literal
// freshness, so the excess-property check never runs. This is a property of
// returning literals from a callback, not of this pattern: today's
// `registerContribution({ compute: () => [...] })` has the identical hole, and
// so does any `const f: () => E[] = () => [{ ...extra }]`.
registerContribution({
  id: "gap/extra-field-not-caught",
  contributes: "resource-ops.filter.process",
  compute: () => [
    { id: "running", label: "Running", tone: "go", predicate: () => true },
  ],
});

// 4b. The same mistake through `emit`, where it IS caught: an argument
// position keeps freshness. A contributor that wants the stricter check writes
// `compute` this way, and nothing else about the mechanism changes.
registerContribution({
  id: "bad/entry-shape",
  contributes: "resource-ops.filter.process",
  compute: (_topics, emit) => {
    emit({
      id: "running",
      label: "Running",
      // @ts-expect-error `tone` is not part of FilterEntry
      tone: "go",
      predicate: () => true,
    });
  },
});

// 5. Wrong entry shape: a required field missing.
registerContribution({
  id: "bad/entry-missing-field",
  // @ts-expect-error `predicate` is required on FilterEntry
  compute: () => [{ id: "running", label: "Running" }],
  contributes: "resource-ops.filter.process",
});

// 6. Wrong entry shape: the OTHER component's entry, in a filter slot.
registerContribution({
  id: "bad/wrong-kind-entry",
  contributes: "resource-ops.filter.process",
  compute: () => [
    // @ts-expect-error that is a MeterEntry, and this slot is a filter
    { partId: "p", resource: "Ore", amount: 1, capacity: 2 },
  ],
});

// 7. Predicate typed against the wrong widget's rows.
registerContribution({
  id: "bad/wrong-row-type",
  contributes: "resource-ops.filter.process",
  compute: () => [
    {
      id: "crewed",
      label: "Crewed",
      // @ts-expect-error ResourceOpsUnit has no `crew`; that is HabitatUnit
      predicate: (unit) => unit.crew > 0,
    },
  ],
});

// 8. Reading a topic the slot never declared.
registerContribution({
  id: "bad/undeclared-topic",
  contributes: "resource-ops.filter.process",
  compute: (topics) => {
    // @ts-expect-error this slot declares only "isru.converters"
    void topics["kerbalism.habitat"];
    return [];
  },
});

// 9. Naming a slot type that does not exist, outside a register call.
// @ts-expect-error no such slot id
type _Bad = ContributionEntry<"resource-ops.filter.nope">;
