// ---------------------------------------------------------------------------
// The widget mirror: one line per widget, declaring what its slots operate on
// and which topics a contribution to any of them may read.
//
// This is the whole of the widget-side cost, and it is deliberately per WIDGET.
// Adding a second filter to ResourceOps, renaming one, or deleting one never
// touches this file, because instance names are not here.
//
// It lives in the sdk for the same reason the existing `ContributionRegistry`
// mirror does: a facade-sealed contributor's program contains the sdk and
// nothing else of gonogo's, so a declaration the app's own packages carry is
// invisible to it. `spike/facade-boundary` proves that.
// ---------------------------------------------------------------------------

/** Mirrors `ResourceOpsUnit` (`packages/components/src/ResourceOps`). */
export type ResourceOpsUnit =
  | { kind: "drill"; drill: { id: string; resource: string } }
  | { kind: "converter"; converter: { id: string; recipe: string } };

/** Mirrors `KerbalismOpsUnit`. Declared here, but deliberately NOT sealed in the
 *  generated manifest, so the prototype covers an unsealed widget too. */
export interface KerbalismOpsUnit {
  processId: string;
  running: boolean;
}

/** Mirrors `ShipMapPart` (`packages/components/src/ShipMap`). */
export interface ShipMapPart {
  partId: string;
  title: string;
}

declare module "./types" {
  interface WidgetRegistry {
    "resource-ops": {
      subject: ResourceOpsUnit;
      topics: "isru.drills" | "isru.converters";
    };
    "ship-map": {
      subject: ShipMapPart;
      topics: "vessel.parts";
    };
    "kerbalism-ops": {
      subject: KerbalismOpsUnit;
      topics: "kerbalism.processes";
    };
    // Two widgets over one subject: the case variant B collapses into a single
    // slot, and the case `inWidget(...)` exists to split again when needed.
    "isru-console": {
      subject: ResourceOpsUnit;
      topics: "isru.drills" | "isru.converters";
    };
    "isru-strip": {
      subject: ResourceOpsUnit;
      topics: "isru.drills" | "isru.converters";
    };
  }
}
