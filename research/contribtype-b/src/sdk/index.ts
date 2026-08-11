// The facade. A contributor sees this and nothing else of gonogo's internals.
//
// The two side-effect imports are load-bearing: they are what puts the widget
// mirror's and the generated manifest's `declare module` blocks into any program
// that imports the sdk. Without them the interfaces stay empty for a
// contributor, which is exactly the failure mode `spike/facade-boundary`
// demonstrates for a declaration left in an app-side package.
import "./widgets";
import "./subjects";

export { ISRU_UNIT, VESSEL_PART } from "./subjects";
import "./__generated__/slot-manifest";

export type { FilterEntry, FilterSelection, MeterEntry } from "./entries";
export {
  announceSlotInstance,
  clearSlotInstances,
  dumpSlotManifest,
  findMisaddressedContributions,
  getMountedSlots,
  type SlotInstance,
} from "./slot-instances";
export {
  type AnyContribution,
  type ApplyEntry,
  type ComponentOfKey,
  type ComponentSlotId,
  type ContributionDefinition,
  componentSlot,
  type EntryFn,
  type EntryForKey,
  type EntryForTarget,
  getContributionsForSlot,
  getRegisteredContributionTargets,
  inWidget,
  type KeyOfTarget,
  registerContribution,
  type SealedSlotId,
  type SlotComponentId,
  type SlotComponentRegistry,
  type SlotRef,
  type SlotTarget,
  type StripWidgetScope,
  type SubjectId,
  type SubjectOf,
  type SubjectOfId,
  type SubjectRegistry,
  type SubjectToken,
  slot,
  subjectToken,
  type TopicsForTarget,
  type TopicsOf,
  type TopicsOfKey,
  type TopicsOfSubject,
  type WidgetId,
  type WidgetOfKey,
  type WidgetRegistry,
  type WidgetScopedSlotId,
  type WidgetSlotManifest,
} from "./types";
export type {
  KerbalismOpsUnit,
  ResourceOpsUnit,
  ShipMapPart,
} from "./widgets";
