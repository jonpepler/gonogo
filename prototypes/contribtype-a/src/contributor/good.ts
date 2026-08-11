// ---------------------------------------------------------------------------
// A facade-sealed external contributor. Imports ONE specifier: the sdk. It has
// never heard of `@ksp-gonogo/components`, `@ksp-gonogo/core` or `ui-kit`, and
// it names no widget file.
//
// What the compiler knows here, and enforces:
//   - "resource-ops.filter.process" is a real slot
//   - its entry is `FilterEntry<ResourceOpsUnit>`, so `predicate`'s parameter
//     is the widget's own row union, narrowable on `kind`
//   - the topics that slot exposes
// ---------------------------------------------------------------------------

import {
  type ContributionEntry,
  type ResourceOpsUnit,
  registerContribution,
} from "../sdk";

registerContribution({
  id: "kerbalism/resource-ops-process-filters",
  contributes: "resource-ops.filter.process",
  compute: (topics) => {
    // The declared topic union is typed; an undeclared one is an error.
    const converters = topics["isru.converters"];
    void converters;
    return [
      {
        id: "running",
        label: "Running",
        group: "process",
        // `unit` is inferred as ResourceOpsUnit: no annotation, no cast.
        predicate: (unit) =>
          unit.kind === "converter" ? unit.converter.running : false,
      },
    ];
  },
});

// The entry type is reachable by slot id alone, which is what lets a
// contributor build its entries in a helper without restating the shape.
type ProcessEntry = ContributionEntry<"resource-ops.filter.process">;

const idle: ProcessEntry = {
  id: "idle",
  label: "Idle",
  predicate: (unit: ResourceOpsUnit) =>
    unit.kind === "converter" && !unit.converter.running,
};

registerContribution({
  id: "kerbalism/resource-ops-idle",
  contributes: "resource-ops.filter.process",
  compute: () => [idle],
});

// A DIFFERENT instance of the same component in the same widget is a
// different slot, targeted the same way.
registerContribution({
  id: "kerbalism/resource-ops-by-resource",
  contributes: "resource-ops.filter.byResource",
  compute: (topics) => {
    void topics["isru.drills"];
    return [
      {
        id: "ore",
        label: "Ore",
        group: "resource",
        predicate: (unit) =>
          unit.kind === "drill" && unit.drill.resource === "Ore",
      },
    ];
  },
});
