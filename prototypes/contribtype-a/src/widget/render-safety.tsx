// ---------------------------------------------------------------------------
// The other half of "there is only one list": the widget cannot render a slot
// it did not declare, and cannot pass a component the wrong props. Both fall
// out of the handles being the only route to the component.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { HABITAT_SLOTS } from "../uplink/HabitatWidget";
import { SLOTS } from "./ResourceOps";

export function Renders(): ReactElement {
  const { process: Process } = SLOTS.handles;
  const { supplies: Supplies } = HABITAT_SLOTS.handles;
  return (
    <>
      <Process.Component label="Process" compact />
      {/* Props are the COMPONENT's, resolved through the kind seam. */}
      {/* @ts-expect-error a filter has no `orientation` */}
      <Process.Component orientation="row" />
      <Supplies.Component orientation="row" />
      {/* @ts-expect-error a meter has no `label` */}
      <Supplies.Component label="Supplies" />
    </>
  );
}

// @ts-expect-error there is no `vessel` handle, so it cannot be rendered
const Undeclared = SLOTS.handles.vessel;
void Undeclared;

// The slot id is a literal type on the handle, not a string: the widget and a
// contributor are provably naming the same thing.
const id: "resource-ops.filter.process" = SLOTS.handles.process.slotId;
void id;
