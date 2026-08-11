// ---------------------------------------------------------------------------
// The WIDGET-LED layer (layer 1), unchanged and coexisting: an app-internal
// slot the widget declares itself, merged into CORE's registry from the
// widget's own file, listed on the widget's `contributionSlots`, and read
// with the explicit-slot-id hooks. A sealed contributor cannot see this slot
// (nothing on the sdk names it), which is the correct default for a slot
// that was never published; publishing it later = adding the one `SlotOf`
// line to the sdk mirror and deleting this block.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { useContributions } from "../core/contributionsRuntime";
import type { PartMeterEntry } from "../sdk";

declare module "../core/contributions" {
  interface ContributionRegistry {
    "ship-map-lite.part-meters": {
      entry: PartMeterEntry;
      topics: "vessel.parts";
    };
  }
}

export function ShipMapLite(): ReactElement {
  const meters = useContributions("ship-map-lite.part-meters");
  return (
    <section aria-label="Ship Map Lite">
      <ul>
        {meters.map((meter) => (
          <li key={`${meter.partId}:${meter.resource}`}>
            {meter.displayName}: {meter.amount}/{meter.capacity}
          </li>
        ))}
      </ul>
    </section>
  );
}
