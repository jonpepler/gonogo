// A widget hosting the SAME slot-bearing component twice. Each mount
// qualifies its slot key with `as`, whose grammar (`` `${string}-filters` ``)
// keeps the composed id's second segment naming its kind:
// `isru-console.process-filters` and `isru-console.resource-filters`.
// Mounting two UNQUALIFIED bars in one widget is the duplicate-mount error
// the runtime test exercises.
import type { ReactElement } from "react";
import { useContributedFilters } from "../core/contributedFilters";
import { FilterBarLite } from "../kit/FilterBarLite";
import type { ResourceOpsUnit } from "../sdk";
import { RESOURCE_OPS_FIXTURE } from "./ResourceOps";

export function IsruConsole(): ReactElement {
  const process = useContributedFilters<ResourceOpsUnit>({
    as: "process-filters",
  });
  const byResource = useContributedFilters<ResourceOpsUnit>({
    as: "resource-filters",
  });

  const shown = byResource.apply(process.apply(RESOURCE_OPS_FIXTURE));

  return (
    <section aria-label="ISRU Console">
      <div data-testid="process-bar">
        <FilterBarLite groups={process.groups} onChange={process.onChange} />
      </div>
      <div data-testid="resource-bar">
        <FilterBarLite
          groups={byResource.groups}
          onChange={byResource.onChange}
        />
      </div>
      <output>{shown.length} units</output>
    </section>
  );
}
