// ---------------------------------------------------------------------------
// Stands for `mod/sitrep-sdk/src/api/contribution-slots.ts`: the first-party
// mirror, ONE line per published component-led slot.
//
// This is the line agent contribtype-a proved necessary and sufficient: a
// sealed contributor's program contains only files reachable from the sdk, so
// a first-party widget's slot keys must be PRESENT on the sdk leaf. What
// changes with `SlotOf` is what the line can get wrong: today's hand mirror
// writes `{ entry: FilterEntry<ResourceOpsUnit>; topics: ... }` and nothing
// stops it naming the wrong entry shape for the component actually mounted;
// `SlotOf<"filters", ResourceOpsUnit, ...>` resolves the entry through the
// component's own kind seam, so the line states exactly three facts (kind,
// rows, topics) and cannot misstate the shape.
//
// Row types are mirrored here the same way the real file mirrors
// `ResourceOpsUnit` today (or imported, where the sdk already generates them).
// ---------------------------------------------------------------------------

import type { SlotOf } from "./types";

/** Mirrors `ResourceOpsUnit` (`ResourceOps/unit.ts`), trimmed fixture shape. */
export type ResourceOpsUnit =
  | {
      kind: "drill";
      drill: { partTitle: string; resource: string; deployed: boolean };
    }
  | { kind: "converter"; converter: { partTitle: string; running: boolean } };

declare module "./types" {
  interface ContributionRegistry {
    // The shipping slot, re-expressed as component-led. Same two-segment id.
    "resource-ops.filters": SlotOf<
      "filters",
      ResourceOpsUnit,
      "isru.drills" | "isru.converters"
    >;

    // A widget hosting the SAME component twice: each mount qualifies its
    // slot key (`as: "process-filters"`), and the qualified key is just
    // another second segment, no new grammar.
    "isru-console.process-filters": SlotOf<
      "filters",
      ResourceOpsUnit,
      "isru.converters"
    >;
    "isru-console.resource-filters": SlotOf<
      "filters",
      ResourceOpsUnit,
      "isru.drills" | "isru.converters"
    >;
  }
}
