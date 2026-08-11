// A first-party widget with TWO instances of the same slot component.
//
// The only thing it writes about its slots is the JSX it was going to write
// anyway. No slot ids, no list on the register call, no context plumbing: the
// widget id comes from the orchestrator's WidgetHost and the instance name is
// the `name` prop at the use site.

import { useState } from "react";
import type { ResourceOpsUnit } from "../sdk";
import { Filter } from "../ui-kit";
import { registerComponent } from "./registry";

const ROWS: readonly ResourceOpsUnit[] = [
  { kind: "drill", drill: { id: "drill-1", resource: "Ore" } },
  { kind: "converter", converter: { id: "conv-1", recipe: "Ore->LqdFuel" } },
];

export function ResourceOps() {
  const [predicates, setPredicates] = useState<
    readonly ((item: ResourceOpsUnit) => boolean)[]
  >([]);

  const rows =
    predicates.length === 0
      ? ROWS
      : ROWS.filter((row) => predicates.some((match) => match(row)));

  return (
    <section>
      {/* Two instances of one component, told apart by `name` alone. */}
      <Filter
        name="process"
        onChange={(next) =>
          setPredicates(next as readonly ((item: ResourceOpsUnit) => boolean)[])
        }
      />
      <Filter name="resource" />
      <ul>
        {rows.map((row) => (
          <li key={row.kind === "drill" ? row.drill.id : row.converter.id}>
            {row.kind}
          </li>
        ))}
      </ul>
    </section>
  );
}

registerComponent({
  id: "resource-ops",
  name: "Resource Ops",
  component: ResourceOps,
});
