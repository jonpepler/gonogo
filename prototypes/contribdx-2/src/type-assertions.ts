// Compile-time assertions for the load-bearing new mechanism: core's
// ContributionRegistry EXTENDS the sdk's, so a slot declared once on the sdk
// is a member of core's id union with no second declaration, while a
// widget-led (core-only) slot stays invisible to the sealed union.

import type {
  ContributionEntry as CoreEntry,
  ContributionSlotId as CoreSlotId,
} from "./core/contributions";
import type {
  FilterEntry,
  ResourceOpsUnit,
  ContributionSlotId as SdkSlotId,
} from "./sdk";
// Ambient merge: the widget-led declaration lives in the widget's own file.
import "./widget/ShipMapLite";

type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;
type Not<T extends boolean> = T extends true ? false : true;

// A slot declared once on the sdk is in BOTH unions (the extends at work).
export type _sdkSlotReachesCore = Expect<
  Extends<"resource-ops.filters", CoreSlotId>
>;
export type _sdkSlotIsSealedVisible = Expect<
  Extends<"resource-ops.filters", SdkSlotId>
>;

// Its entry type resolves identically through core (via inheritance).
export type _entryResolvesThroughCore = Expect<
  Extends<CoreEntry<"resource-ops.filters">, FilterEntry<ResourceOpsUnit>>
>;

// A widget-led, core-only slot is readable in-repo but NOT sealed-visible:
// unpublished by default, published by adding the one SlotOf line.
export type _widgetLedSlotInCore = Expect<
  Extends<"ship-map-lite.part-meters", CoreSlotId>
>;
export type _widgetLedSlotNotSealed = Expect<
  Not<Extends<"ship-map-lite.part-meters", SdkSlotId>>
>;

// The qualified multi-mount keys are ordinary registry members.
export type _qualifiedKeyIsDeclared = Expect<
  Extends<"isru-console.process-filters", SdkSlotId>
>;
