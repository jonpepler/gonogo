import type { ContributionEntry } from "@ksp-gonogo/sitrep-sdk";
import { magnitudeOf } from "@ksp-gonogo/ui-kit";
import type {
  KerbalismSpaceWeather,
  KerbalismStarInfo,
  KerbalismStormEntry,
} from "../__generated__/contract";
import { KERBALISM } from "../uplink";

// ---------------------------------------------------------------------------
// CME / solar-activity overlay: a `system-view.entities` contribution off
// `kerbalism.spaceweather`, the same shape-contribution seam the built-in
// vessel-orbit and CommNet-graph entries ride (`SystemView/
// vesselOrbitsContribution.ts`). One faint directional `plume` per active
// storm slot, so SystemView renders it without knowing Kerbalism exists.
//
// `KerbalismSpaceWeather.storms` is scoped to the ACTIVE VESSEL's current SOI
// body: one entry per (that body, star) pair (`Storm.StormKey`), so at most
// one entry per star in a single-star system, a handful in a modded
// binary/trinary one. A storm with `stormState === 0` carries no
// `stormTime`/`stormDuration`/`dist` (Kerbalism's own `StormData.Reset()`
// zeroes them) and is skipped outright, never drawn from a fabricated
// position.
//
// HONESTY NOTE on the plume's geometry: a CME is a targeted mass ejection
// from ONE point on the star travelling in ONE direction, not a spherical
// front, so this used to be wrong even before we had a bearing to draw it
// with (an earlier version drew a `blob`, a concentric circle, purely
// because that was the only directional-less shape available).
// `KerbalismStormEntry.dist` is the LIVE sun-to-body distance (`Storm.
// Update`'s own geometry), not a tracked position of the CME's leading edge,
// Kerbalism's contract has no field for "how far has the ejecta travelled so
// far". A literal expanding shockwave would have to interpolate that from
// wall-clock time, which a contribution's `compute()` never receives
// (contribution-slots-spec: pure function of Topics/Processors only, see
// `contributions.ts`'s own doc comment). Rather than fabricate a travelled
// distance, the plume's LENGTH is still just `dist`: a faint wedge reaching
// from the star out to the body currently in that storm's scope. The NEW
// part is its bearing: `KerbalismSpaceWeather.stars` carries each star's
// vessel-to-star unit `direction` (`VesselData.SunInfo.Direction`), captured
// on the same reflection pass as the storm slot itself, so a star entry is
// always present alongside a storm entry for that star. Negating it gives a
// star-to-vessel bearing, a fair stand-in for star-to-body (the vessel sits
// inside that body's SOI, negligible next to interplanetary `dist`). This
// diagram already flattens every orbit onto one plane (`SystemDiagram`
// ignores inclination), so the bearing does the same: only the direction
// vector's x/z components are used (its y, the out-of-plane component, is
// dropped), matching the plane every other entity in this diagram already
// draws into. A storm with no matching `stars` entry (defensive: the two
// lists come off the same reflection loop, so this shouldn't happen in
// practice) is skipped outright rather than drawn with a fabricated bearing.
// `stormState` still distinguishes inbound (faint, neutral) from arrived
// (faint, warn-tinted) so the plume shows the storm progressing between
// those two real, known states.
// ---------------------------------------------------------------------------

type CmeEntity = ContributionEntry<"system-view.entities">;
/** `SystemEntityMeta` isn't part of the sdk's public surface (only the entry
 *  type is); derived here so the meta literal below still type-checks. */
type CmeEntityMeta = NonNullable<CmeEntity["meta"]>;

const CME_WARN_COLOUR = "var(--color-status-warning-fg-muted)";

const STORM_STATE_INBOUND = 1;
const STORM_STATE_IN_PROGRESS = 2;

function stormStateLabel(state: number): string {
  if (state === STORM_STATE_INBOUND) return "inbound";
  if (state === STORM_STATE_IN_PROGRESS) return "in progress";
  return "unknown";
}

/** Fraction of `dist` the plume's tip half-width resolves to: a ~20 degree
 *  full cone, wide enough to read as "aimed at a body" rather than a hairline. */
const PLUME_HALF_WIDTH_RATIO = 0.18;

/**
 * The star-to-body bearing, in the diagram's own parent-centric metres, from
 * `star.direction` (Kerbalism's vessel-to-star unit vector): negated for
 * star-to-vessel, x/z only (this diagram's own flattened plane, see this
 * file's honesty note above), scaled to `distMetres`. `null` when the
 * direction is absent or degenerate (e.g. a zero vector, or its x/z
 * components both vanish because the vessel sits exactly along the star's
 * polar axis): the caller treats that the same as any other missing datum,
 * no draw rather than a fabricated bearing.
 */
function bearingMetres(
  direction: KerbalismStarInfo["direction"] | undefined,
  distMetres: number,
): { xMetres: number; yMetres: number } | null {
  if (!direction) return null;
  const dx = magnitudeOf(direction.x);
  const dz = magnitudeOf(direction.z);
  if (dx == null || dz == null) return null;
  const planarMag = Math.hypot(dx, dz);
  if (!(planarMag > 0)) return null;
  // `|| 0` normalises a -0 result (e.g. dz === 0) to plain 0: a real
  // negative bearing is truthy and passes through untouched, only the
  // signed-zero edge case gets folded.
  return {
    xMetres: (-dx / planarMag) * distMetres || 0,
    yMetres: (-dz / planarMag) * distMetres || 0,
  };
}

/**
 * Pure core, exported so a test can call it directly against a plain
 * `KerbalismSpaceWeather` fixture (mirrors `spaceWeatherBadges`'s and
 * `computeKerbalismPartMeters`'s own export-the-pure-core pattern).
 *
 * A storm entry is omitted outright (never a degraded/placeholder entry) when
 * its state is 0/absent, its star name is missing, its distance is
 * missing/non-positive, or `stars` carries no resolvable bearing for that
 * star: the same "no data, no draw" discipline `computeVesselOrbitEntities`
 * already applies to a vessel with no resolvable body.
 */
export function computeCmeEntities(
  weather: KerbalismSpaceWeather | undefined,
): CmeEntity[] {
  if (!weather) return [];
  const ejectionSpeedMps = magnitudeOf(weather.stormEjectionSpeed);
  const entities: CmeEntity[] = [];
  for (const storm of weather.storms ?? []) {
    const entity = computeStormEntity(storm, weather.stars, ejectionSpeedMps);
    if (entity) entities.push(entity);
  }
  return entities;
}

function computeStormEntity(
  storm: KerbalismStormEntry,
  stars: readonly KerbalismStarInfo[] | undefined,
  ejectionSpeedMps: number | null,
): CmeEntity | null {
  const state = magnitudeOf(storm.stormState);
  if (state == null || state === 0) return null;
  if (typeof storm.star !== "string" || storm.star.length === 0) return null;
  const dist = magnitudeOf(storm.dist);
  if (dist == null || !(dist > 0)) return null;

  const starInfo = stars?.find((s) => s.star === storm.star);
  const bearing = bearingMetres(starInfo?.direction, dist);
  if (!bearing) return null;

  const arrivalUt = magnitudeOf(storm.stormTime);
  const durationS = magnitudeOf(storm.stormDuration);
  const meta: CmeEntityMeta = {
    star: storm.star,
    state: stormStateLabel(state),
    distM: dist,
    ...(arrivalUt != null ? { arrivalUt } : {}),
    ...(durationS != null ? { durationS } : {}),
    ...(ejectionSpeedMps != null ? { ejectionSpeedMps } : {}),
  };

  return {
    id: `cme:${storm.star}`,
    // Fixed at the star's own position (the plume's apex): this entity only
    // projects when the diagram's current frame IS that star (SystemView's
    // "root parent" frame setting, the whole-system view a CME threatening
    // the whole neighbourhood belongs on), same off-frame degrade every
    // other entity gets.
    position: { kind: "fixed", parentName: storm.star, xMetres: 0, yMetres: 0 },
    shape: {
      kind: "plume",
      to: { kind: "fixed", parentName: storm.star, ...bearing },
      halfWidthMetres: dist * PLUME_HALF_WIDTH_RATIO,
    },
    // Faint by default, always: an ambient effect that stacks under the
    // CommNet graph and point markers (SYSTEM_ENTITY_DEFAULT_LAYER's
    // plume=1, below connection-line=2/point=3), never a bright alarm
    // competing with them. `stormState === 2` shifts the hue toward the
    // shared warn token rather than raising emphasis, so "arrived" reads as
    // distinct without the marker ever cutting off what's drawn on top of it.
    style: {
      emphasis: "faint",
      ...(state === STORM_STATE_IN_PROGRESS ? { colour: CME_WARN_COLOUR } : {}),
    },
    meta,
  };
}

KERBALISM.registerContribution({
  id: "system-view-cme",
  contributes: "system-view.entities",
  deps: ["kerbalism.spaceweather"],
  requires: "kerbalism",
  compute: (topics) =>
    computeCmeEntities(
      topics["kerbalism.spaceweather"] as KerbalismSpaceWeather | undefined,
    ),
});
