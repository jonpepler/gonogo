// A second widget, mounting a DIFFERENT slot component. Same story: the only
// declaration is the JSX.

import { MeterList } from "../ui-kit";
import { registerComponent } from "./registry";

export function ShipMap() {
  return (
    <section>
      <MeterList name="supplies" />
    </section>
  );
}

registerComponent({ id: "ship-map", name: "Ship Map", component: ShipMap });
