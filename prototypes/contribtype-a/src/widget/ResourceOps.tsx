// ---------------------------------------------------------------------------
// A first-party widget. Stand-in for
// `packages/components/src/ResourceOps/index.tsx`.
//
// The whole point of the pattern is what is ABSENT from this file:
//
//   - no `contributionSlots: [...]` on the register call
//   - no slot id string anywhere
//   - no second list of the components it mounts
//
// The `SLOTS` object below is not a manifest kept alongside the render code.
// It IS the render code's only handle on those components: `<SLOTS.handles.
// process.Component/>` cannot be written without it. Delete the handle and
// the JSX stops compiling; add a handle and the slot exists, is registered at
// module load, and is targetable by a contributor. There is nothing to keep
// in sync because there is only one copy.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { filterSlot } from "../kit/Filter";
import { defineDeclaredSlots } from "../kit/slots";
import type { ResourceOpsUnit } from "../sdk/contract";

const WIDGET_ID = "resource-ops";

export const SLOTS = defineDeclaredSlots(WIDGET_ID, {
  process: filterSlot<ResourceOpsUnit>()({ topics: ["isru.converters"] }),
  byResource: filterSlot<ResourceOpsUnit>()({
    topics: ["isru.drills", "isru.converters"],
  }),
});

const { process: Process, byResource: ByResource } = SLOTS.handles;

export function ResourceOpsComponent(): ReactElement {
  return (
    <section aria-label="Resource Ops">
      {/* The same component, mounted twice, distinguished only by the handle */}
      <Process.Component label="Process" />
      <ByResource.Component label="Resource" compact />
    </section>
  );
}

// The register call. Note the absence of any slot declaration: the widget
// tells the registry what it IS, never what can be contributed into it.
export const definition = {
  id: WIDGET_ID,
  name: "Resource Ops",
  component: ResourceOpsComponent,
  dataRequirements: ["isru.drills", "isru.converters"] as const,
};
