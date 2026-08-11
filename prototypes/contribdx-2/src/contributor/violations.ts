// Every mistake a sealed contributor can make, each pinned by an expect-error
// directive that verify.sh strips to print the real diagnostics. Case 5 is
// the honest gap, deliberately NOT suppressed: it compiles.

import { type ContributionSlotId, registerContribution } from "../sdk";

// 1. Typo in the slot id, with the `satisfies` guard: compile error, and the
//    diagnostic suggests the correct id ("Did you mean ...").
registerContribution({
  id: "violation/typo",
  // @ts-expect-error "resource-ops.filterz" is not a declared slot
  contributes: "resource-ops.filterz" satisfies ContributionSlotId,
  compute: () => [],
});

// 2. A filter entry missing its predicate: rejected against
//    FilterEntry<ResourceOpsUnit>, resolved through the SlotOf line.
registerContribution({
  id: "violation/missing-predicate",
  contributes: "resource-ops.filters" satisfies ContributionSlotId,
  // @ts-expect-error predicate is required on FilterEntry
  compute: () => [{ id: "x", label: "X" }],
});

// 3. A predicate written against the wrong row shape: ResourceOpsUnit has no
//    `crew`.
registerContribution({
  id: "violation/wrong-rows",
  contributes: "resource-ops.filters" satisfies ContributionSlotId,
  compute: () => [
    {
      id: "crewed",
      label: "Crewed",
      // @ts-expect-error Property 'crew' does not exist on ResourceOpsUnit
      predicate: (unit) => unit.crew > 0,
    },
  ],
});

// 4. A meter entry handed to a filters slot: the kinds' entry shapes are
//    disjoint, so the meter fields are rejected.
registerContribution({
  id: "violation/wrong-kind",
  contributes: "resource-ops.filters" satisfies ContributionSlotId,
  compute: () => [
    {
      // @ts-expect-error PartMeterEntry fields are not a FilterEntry
      partId: "p1",
      resource: "Ore",
      displayName: "Ore",
      amount: 1,
      capacity: 2,
    },
  ],
});

// 5. THE HONEST GAP (no suppression: this COMPILES). Without `satisfies`, a
//    misspelt id falls to registerContribution's open `S extends string`
//    signature and the loose entry fallback, exactly as the shipping system
//    behaves today. The runtime backstop is the contributions debug surface
//    flagging a contribution whose slot never mounts. The open signature is
//    load-bearing: the automatic `<widget>.badges` slots are runtime strings
//    that must stay targetable, so the registry union cannot be a hard
//    constraint on the call.
registerContribution({
  id: "violation/typo-without-satisfies",
  contributes: "resource-ops.filterz",
  compute: () => [{ id: "x", label: "X" }],
});
