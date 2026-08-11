// ---------------------------------------------------------------------------
// THE contribution-slot declarations: the `ContributionRegistry`
// declaration-merge for every first-party (packages/components-owned)
// contribution slot, authored here on the sdk leaf and NOWHERE ELSE. This is
// not a mirror of a widget-side copy: a facade-sealed contributor's program
// can only see modules reachable from this package (the package-graph fact
// that forces the declaration onto the leaf), so the leaf copy is made the
// single source and the owning widget imports its published row/entry types
// from `@ksp-gonogo/sitrep-sdk` instead of keeping a duplicate. Core's
// `ContributionRegistry` extends this one, so in-repo and sealed programs
// type against the same declarations with no drift to guard. Same
// "components-owned only, Uplink-owned slots stay in the Uplink's own file"
// scope split as `slots.ts` (see that file's header for the long form).
//
// Merges into the `ContributionRegistry {}` base declared in `./types.ts`,
// exactly like `slots.ts` merges into that file's `SlotRegistry {}` base: TS
// module augmentation with a relative specifier only attaches to an EXISTING
// export of the target module (an augmentation of a name types.ts hasn't
// declared is instead treated as a brand new ambient module declaration,
// which TS rejects outright for a relative path), so the base interface has
// to live in types.ts itself even while it stays empty.
//
// The `export {}` below is load-bearing, not decorative: it is what makes
// this FILE a module in TS's eyes. `slots.ts` gets that status for free from
// its own top-level `export interface` declarations (its real slot context
// types); this scaffold has no such content yet, so without an explicit
// export TS would treat it as a global script and reject the relative
// `declare module` specifier below with "Ambient module declaration cannot
// specify relative module name". Drop this line once the first real
// contribution slot's context type gives the file a natural export.
//
// The first two first-party contribution slots landed here (spec §13.4, the
// framework's self-contribution flagship): ShipMap's `ship-map.part-meters`
// and `ship-map.part-meta`, both owned by `packages/components/src/ShipMap`.
// Every OTHER first-party contribution to date rides the automatic
// `${componentId}.badges` slot, which is a runtime string, never a member of
// this declaration-merged registry (see `useWidgetBadges`'s own doc
// comment); these two are the first GENUINELY typed, declared slots.
//
// `MeterTone` is duplicated rather than imported from `@ksp-gonogo/ui-kit`:
// ui-kit's own `Meter.tsx` imports `value` from this package, so importing
// ui-kit back here would be the exact same leaf-cycle this file's header
// (and `./slots.ts`'s) already explains for `@ksp-gonogo/components`.
//
// `ShipMapPartMeterEntry` no longer carries a `tone` (design doc:
// local_docs/design/2026-08-08-resource-colour-system.md, gonogo main
// repo): the meter's fill is the resource's IDENTITY colour, derived by the
// renderer from `resource` via ui-kit's `resourceColor`, never chosen by a
// contributor. `status` is the SEPARATE, level-driven signal (a border tint
// or badge) that `tone` used to conflate with the fill hue. `ShipMapMeterTone`
// stays exported for `ShipMapPartMetaEntry`, which is a different kind of
// row (process running/broken, habitat pressure, ...) and is unaffected by
// this change: its `tone` genuinely IS a status colour, not an identity.
// ---------------------------------------------------------------------------

import type {
  IsruConverterEntry,
  IsruDrillEntry,
} from "../__generated__/contract";
import type { FilterEntry } from "./types";

/** Mirrors ui-kit's `MeterTone` (`packages/ui-kit/src/Meter.tsx`). */
export type ShipMapMeterTone = "neutral" | "go" | "warn" | "nogo" | "info";

/**
 * One resource meter for a single part, aggregated from the
 * `ship-map.part-meters` contribution slot (the framework's self-
 * contribution flagship, spec §13.4). Both the built-in `core` contribution
 * (the five classic drainable propellants, `ShipMap/partMetersContribution.ts`)
 * and a Kerbalism-style Uplink contribution (its supply tanks) emit this SAME
 * shape onto the SAME slot, so `ShipDiagramSvg`'s per-part fill bars and
 * `ShipDiagram`'s hover tooltip read one aggregated list regardless of which
 * contributor produced an entry. There is no hardcoded resource allowlist
 * left in ShipMap itself: which resource earns a meter on which part is
 * entirely the contributor's call. Canonical here; the ShipMap widget
 * re-exports it (`ShipMap/shipTopology.ts`).
 *
 * Identity vs status (design doc: local_docs/design/2026-08-08-resource-
 * colour-system.md, gonogo main repo): the meter's FILL colour is the
 * resource's IDENTITY (`resourceColor(resource)`, derived by the renderer
 * from `resource`, not carried on the wire), and is entirely independent of
 * `status`. This retires the previous `tone`-as-identity field, which
 * conflated "what resource is this" with "how full is it" into one
 * five-value enum; a contributor no longer picks a colour at all, only a
 * name and a status.
 */
export interface ShipMapPartMeterEntry {
  /**
   * `ShipMapPart.flightId`, stringified: contribution entries travel through
   * the generic per-slot aggregation store as plain data, so the key stays a
   * string rather than baking in a numeric-vs-string identity assumption.
   */
  partId: string;
  /** Resource name exactly as it appears on `vessel.parts` (e.g.
   *  "LiquidFuel", "Water"). Doubles as part of this meter's identity: a
   *  contributor should emit at most one entry per (partId, resource) pair.
   *  Also the renderer's key into `resourceColor` for the fill's identity
   *  colour, see this interface's own doc comment. */
  resource: string;
  /** Human label. Falls back to `resource` when the contributor has no nicer
   *  name (the built-in five don't; a Kerbalism profile's
   *  `KerbalismResourceDef.displayName` does). */
  displayName: string;
  /** Current stored amount, resource units. */
  amount: number;
  /** Max storage capacity, resource units. A renderer drops any entry with
   *  `capacity <= 0` (nothing to fill), the same guard the old hardcoded
   *  `renderResourceFill` applied. */
  capacity: number;
  /**
   * A SEPARATE status signal, never the fill hue: `"critical"` /
   * `"low"` draw a border tint or badge alongside the identity-coloured
   * fill; `null`/`undefined` means healthy, no status signal drawn. A
   * contributor decides its own low/critical thresholds (a Kerbalism
   * profile's `lowThreshold`, or the built-in contribution's own ratio
   * cutoffs); ShipMap only renders whichever of the two levels it's given.
   */
  status?: "low" | "critical" | null;
}

/**
 * One per-part status/metadata row for the `ship-map.part-meta` slot: things
 * about a part that aren't a fill-level meter. Today the Kerbalism
 * contribution only has real per-part data for a fitted process's
 * running/broken state (`KerbalismLifeSupport.processes[].flightId`); habitat
 * pressure, radiation dose, and reliability MTBF are NOT yet on the wire with
 * per-part granularity (only vessel-wide aggregates), so no contributor emits
 * a `"ratio"` entry yet. The shape reserves that case rather than leaving it
 * unmodelled, see the Kerbalism contribution's own doc comment for the exact
 * gap. Canonical here; the ShipMap widget re-exports it
 * (`ShipMap/shipTopology.ts`).
 */
export interface ShipMapPartMetaEntry {
  /** `ShipMapPart.flightId`, stringified (see `ShipMapPartMeterEntry.partId`). */
  partId: string;
  /** Short label, e.g. "Water Recycler". Doubles as part of this row's
   *  identity: a contributor should emit at most one entry per (partId,
   *  label) pair. */
  label: string;
  tone: ShipMapMeterTone;
  /**
   * "ratio": a 0..1 reading, rendered as a `<Meter>` (reserved: see the
   * interface doc above, nothing emits this today). "text": a free-form
   * status string, rendered as a plain label/value row (fitted-process
   * running/broken/idle state today).
   */
  kind: "ratio" | "text";
  /** Present when `kind === "ratio"`. */
  value?: number;
  /** Present when `kind === "text"`. */
  text?: string;
}

// --- ResourceOps (packages/components/src/ResourceOps) ---------------------
//
// The first FILTER slot (contribution-slots-spec §15). Its entry is the
// generic `FilterEntry` over the widget's own row union, so the mirror only
// has to carry that union: the entry shape itself is owned by `./types.ts`
// and needs no per-slot duplicate.
//
// `IsruDrillEntry`/`IsruConverterEntry` are GENERATED contract types this
// package already owns, so this one is a real import rather than a hand-kept
// mirror: no leaf cycle exists inside the sdk's own generated surface.

/** One row of ResourceOps' list, tagged so a filter can tell the two kinds
 *  apart. Canonical here; the widget re-exports it (`ResourceOps/unit.ts`). */
export type ResourceOpsUnit =
  | { kind: "drill"; drill: IsruDrillEntry }
  | { kind: "converter"; converter: IsruConverterEntry };

declare module "./types" {
  interface ContributionRegistry {
    "resource-ops.filters": {
      entry: FilterEntry<ResourceOpsUnit>;
      topics: "isru.drills" | "isru.converters";
    };
    "ship-map.part-meters": {
      entry: ShipMapPartMeterEntry;
      topics: "vessel.parts" | "kerbalism.profile";
    };
    "ship-map.part-meta": {
      entry: ShipMapPartMetaEntry;
      topics: "kerbalism.lifesupport" | "kerbalism.profile";
    };
  }
}
