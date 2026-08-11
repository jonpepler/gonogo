// ---------------------------------------------------------------------------
// The published facade. Stand-in for `@ksp-gonogo/sitrep-sdk`: the ONLY
// specifier an external contributor package may import.
//
// The side-effect import is load-bearing: it is what pulls the first-party
// manifest mirror into every sealed contributor's TS program.
// ---------------------------------------------------------------------------

import "./first-party-slots";

// Component-owned entry types, re-exported so a contributor can name them.
// (In the real tree `FilterEntry` already lives on the sdk and ui-kit imports
// it from there, which is the same seal viewed from the other end.)
export type { FilterEntry } from "../kit/Filter";
export type { MeterEntry } from "../kit/Meter";
export {
  type BroadcastContribution,
  type ContributionDefinition,
  type ContributionEntry,
  type ContributionSlotId,
  type ContributionTopics,
  type Emit,
  type EntryFor,
  type RowName,
  type RowTypes,
  registerBroadcastContribution,
  registerContribution,
} from "../kit/slots";

// Row types, already mirrored on the sdk today.
export type {
  IsruConverterEntry,
  IsruDrillEntry,
  ResourceOpsUnit,
} from "./contract";
