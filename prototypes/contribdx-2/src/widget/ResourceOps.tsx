// ---------------------------------------------------------------------------
// Stands for `packages/components/src/ResourceOps/index.tsx`, the widget that
// today carries the `resource-ops.filters` slot. Compare its real slot cost:
//
//   an 8-line `declare module "@ksp-gonogo/core"` ContributionRegistry block
//   + `contributionSlots: ["resource-ops.filters"]` on registerComponent
//   + `useContributedFilters("resource-ops.filters")`
//
// Here the widget writes ZERO slot lines: `useContributedFilters<Row>()`
// composes `resource-ops.filters` from WidgetMetaContext, announces it for
// aggregation, and everything else is unchanged. The slot's PUBLICATION for
// sealed contributors is the one `SlotOf` line in `../sdk/contribution-slots.ts`,
// which the widget file no longer duplicates.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { useContributedFilters } from "../core/contributedFilters";
import { FilterBarLite } from "../kit/FilterBarLite";
import type { ResourceOpsUnit } from "../sdk";

export const RESOURCE_OPS_FIXTURE: readonly ResourceOpsUnit[] = [
  {
    kind: "drill",
    drill: { partTitle: "Drill-O-Matic", resource: "Ore", deployed: true },
  },
  {
    kind: "converter",
    converter: { partTitle: "Convert-O-Tron 250", running: true },
  },
  {
    kind: "converter",
    converter: { partTitle: "Convert-O-Tron 125", running: false },
  },
];

function unitLabel(unit: ResourceOpsUnit): string {
  return unit.kind === "drill"
    ? unit.drill.partTitle
    : unit.converter.partTitle;
}

export function ResourceOps(): ReactElement {
  const filters = useContributedFilters<ResourceOpsUnit>();
  const shown = filters.apply(RESOURCE_OPS_FIXTURE);

  return (
    <section aria-label="Resource Ops">
      <FilterBarLite groups={filters.groups} onChange={filters.onChange} />
      <ul>
        {shown.map((unit) => (
          <li key={unitLabel(unit)}>{unitLabel(unit)}</li>
        ))}
      </ul>
    </section>
  );
}
