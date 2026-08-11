// ---------------------------------------------------------------------------
// VARIANT B: the slot key drops the widget entirely and names the SUBJECT
// instead, so a slot id is `${componentId}.${subjectId}`.
//
// This is the operator's "accept a component slot for any widget" idea, with one
// change: the missing half is not the instance name, it is the SUBJECT. A
// `FilterEntry<T>` is only worth typing if something says what T is, and under
// pure component keying nothing does, so every predicate collapses to
// `(item: unknown)`. Naming the subject restores the type AND keeps the property
// that made the idea attractive: both halves of the key are statically
// enumerable without anyone knowing which widget renders what.
//
// One line per SUBJECT, and a subject is a data shape the sdk already mirrors
// for other reasons. Nothing per widget, nothing per instance, no manifest, no
// codegen.
// ---------------------------------------------------------------------------

import { subjectToken } from "./types";
import type { ResourceOpsUnit, ShipMapPart } from "./widgets";

declare module "./types" {
  interface SubjectRegistry {
    "isru-unit": {
      subject: ResourceOpsUnit;
      topics: "isru.drills" | "isru.converters";
    };
    "vessel-part": {
      subject: ShipMapPart;
      topics: "vessel.parts";
    };
  }
}

/** The subject tokens a widget passes at the use site. */
export const ISRU_UNIT = subjectToken("isru-unit");
export const VESSEL_PART = subjectToken("vessel-part");
