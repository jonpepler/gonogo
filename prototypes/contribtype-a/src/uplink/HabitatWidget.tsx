// ---------------------------------------------------------------------------
// An OUT-OF-REPO Uplink shipping its own widget. This is the fully passive
// path, and it is the one that matters for the decentralised devkit model:
// the Uplink owns its package, so it can augment the seam itself and the
// manifest is `typeof` its own handles. Nothing is restated.
//
// Adding `waste: filterSlot<HabitatUnit>()(...)` below makes
// "kerbalism-habitat.filter.waste" exist, targetable and typed, with no other
// edit in this file or any other. That is goal 2 with nothing traded away.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import { filterSlot } from "../kit/Filter";
import { meterSlot } from "../kit/Meter";
import { defineSlots } from "../kit/slots";

export interface HabitatUnit {
  partId: string;
  crew: number;
  pressurised: boolean;
}

const WIDGET_ID = "kerbalism-habitat";

export const HABITAT_SLOTS = defineSlots(WIDGET_ID, {
  // Same component as ResourceOps mounts, in a different widget: different
  // slot id, different row type, zero interaction between the two.
  pressure: filterSlot<HabitatUnit>()({ topics: ["kerbalism.habitat"] }),
  // A second component kind in the same widget.
  supplies: meterSlot()({ topics: ["kerbalism.lifesupport"] }),
  // Added after the augmentation below was written, to make the point: this
  // line is the ONLY edit "kerbalism-habitat.filter.waste" needed to exist,
  // be typed and be targetable. `typeof HABITAT_SLOTS` widened on its own.
  waste: filterSlot<HabitatUnit>()({ topics: ["kerbalism.habitat"] }),
});

// The Uplink's own augmentation. In the real tree the specifier is the bare
// package name `"@ksp-gonogo/sitrep-sdk"`, which is exactly why a third party
// can do this at all: module augmentation binds to the module, not the file
// tree, so an Uplink published to npm widens the registry for anyone who
// depends on it.
declare module "../kit/slots" {
  interface WidgetSlotManifests {
    "kerbalism-habitat": typeof HABITAT_SLOTS;
  }
}

const {
  pressure: Pressure,
  supplies: Supplies,
  waste: Waste,
} = HABITAT_SLOTS.handles;

export function HabitatWidget(): ReactElement {
  return (
    <section aria-label="Habitat">
      <Pressure.Component label="Pressure" />
      <Supplies.Component orientation="row" />
      <Waste.Component label="Waste" />
    </section>
  );
}
