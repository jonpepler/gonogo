// ---------------------------------------------------------------------------
// The first-party manifest mirror. Stand-in for
// `mod/sitrep-sdk/src/api/contribution-slots.ts`.
//
// This file exists for one structural reason, not a type-system one: a
// facade-sealed contributor's TS program contains only the files reachable
// from `@ksp-gonogo/sitrep-sdk`, and the sdk leaf cannot import
// `@ksp-gonogo/components` (turbo `^build` cycle: components already depends
// on the sdk). So a first-party widget's slot keys have to be PRESENT here or
// no sealed contributor can ever see them. That constraint predates this
// pattern; the repo already hand-mirrors `ContributionRegistry` here and
// guards it with a conformance `test-d`.
//
// What the pattern changes is the direction of enforcement. The mirror is now
// the DECLARATION and the widget's `defineDeclaredSlots(...)` literal is the
// checked party, so drift is a compile error at the widget naming the exact
// instance, in both directions, with no separate conformance file:
//
//   handle with no mirror entry   -> excess property on the widget's literal
//   mirror entry with no handle   -> missing property on the widget's literal
//
// An out-of-repo Uplink has no such constraint and writes no mirror at all:
// it augments the same seam from its own package with `typeof` its handles,
// which is fully inferred (see `src/uplink/HabitatWidget.tsx`).
// ---------------------------------------------------------------------------

import type { SlotSpec, WidgetSlots } from "../kit/slots";
import "./contract";

declare module "../kit/slots" {
  interface WidgetSlotManifests {
    "resource-ops": WidgetSlots<
      "resource-ops",
      {
        process: SlotSpec<"filter", "ResourceOpsUnit", "isru.converters">;
        byResource: SlotSpec<
          "filter",
          "ResourceOpsUnit",
          "isru.drills" | "isru.converters"
        >;
      }
    >;
  }
}
