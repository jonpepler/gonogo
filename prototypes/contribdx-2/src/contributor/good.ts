// ---------------------------------------------------------------------------
// A facade-sealed contributor: imports ONLY from the sdk (tsconfig.sealed.json
// proves its program never contains the widget or core files). Everything
// here is typed off the one `SlotOf` line per slot in the sdk mirror.
//
// `satisfies ContributionSlotId` is the opt-in typo guard: registerContribution
// keeps its shipping open `S extends string` signature (the automatic
// `<widget>.badges` slots are runtime strings and must stay targetable), so a
// bare misspelt id would silently degrade to the loose entry type. One
// `satisfies` per contribution turns that into a compile error with the
// correct id suggested. The violations file shows both sides.
// ---------------------------------------------------------------------------

import { type ContributionSlotId, registerContribution } from "../sdk";

registerContribution({
  id: "kerbalism/resource-ops-process",
  contributes: "resource-ops.filters" satisfies ContributionSlotId,
  deps: ["isru.converters"],
  compute: (topics) => {
    // Declared topics are present on the typed bag; payload precision is
    // simplified to `unknown` in this prototype (the real `ContributionTopics`
    // resolves `TopicPayload<K>`).
    void topics["isru.converters"];
    return [
      {
        id: "running",
        label: "Running",
        group: "process",
        groupLabel: "Process",
        // `as const` mirrors the shipping resourceFilters.ts idiom: a mixed-
        // shape array widens property literals before the contextual check.
        selection: "multi" as const,
        // `unit` is inferred as ResourceOpsUnit through the SlotOf line;
        // nothing is annotated here.
        predicate: (unit) =>
          unit.kind === "converter" && unit.converter.running,
      },
      {
        id: "idle",
        label: "Idle",
        group: "process",
        predicate: (unit) =>
          unit.kind === "converter" && !unit.converter.running,
      },
    ];
  },
});

// The multi-mount widget's PROCESS bar only; the resource bar is a different
// slot and does not receive this.
registerContribution({
  id: "kerbalism/isru-console-process",
  contributes: "isru-console.process-filters" satisfies ContributionSlotId,
  compute: () => [
    {
      id: "running",
      label: "Running",
      group: "process",
      predicate: (unit) => unit.kind === "converter" && unit.converter.running,
    },
  ],
});
