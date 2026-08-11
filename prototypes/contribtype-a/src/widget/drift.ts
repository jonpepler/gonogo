// ---------------------------------------------------------------------------
// The first-party drift ratchet, proven in both directions.
//
// A first-party widget cannot reach the sdk leaf, so its manifest is mirrored
// there ahead of it. That mirror is not documentation kept honest by review:
// `defineDeclaredSlots` checks the widget's literal against it, so the two
// cannot disagree without a compile error naming the offending instance.
// ---------------------------------------------------------------------------

import { filterSlot } from "../kit/Filter";
import { meterSlot } from "../kit/Meter";
import { defineDeclaredSlots } from "../kit/slots";
import type { ResourceOpsUnit } from "../sdk/contract";

const process = filterSlot<ResourceOpsUnit>()({ topics: ["isru.converters"] });
const byResource = filterSlot<ResourceOpsUnit>()({
  topics: ["isru.drills", "isru.converters"],
});

// 1. A handle the mirror has never heard of.
export const EXTRA = defineDeclaredSlots("resource-ops", {
  process,
  byResource,
  // @ts-expect-error mount a new filter and the sdk mirror must gain it too
  vessel: filterSlot<ResourceOpsUnit>()({}),
});

// 2. A mirror entry with no handle behind it: dead slot, caught at the widget.
// @ts-expect-error "byResource" is declared but not rendered
export const MISSING = defineDeclaredSlots("resource-ops", { process });

// 3. Right instance name, wrong component: the mirror says filter.
export const WRONG_KIND = defineDeclaredSlots("resource-ops", {
  // @ts-expect-error a meter cannot fill a slot declared as a filter
  process: meterSlot()({}),
  byResource,
});

// 4. Right component, wrong row type: predicates would be typed against a
// union this widget never renders.
export const WRONG_ROW = defineDeclaredSlots("resource-ops", {
  // @ts-expect-error the mirror declares ResourceOpsUnit rows
  process: filterSlot<{ crew: number }>()({ topics: ["isru.converters"] }),
  byResource,
});
