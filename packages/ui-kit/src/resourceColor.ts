// ---------------------------------------------------------------------------
// Resource-identity colour primitive (design doc: gonogo main repo,
// local_docs/design/2026-08-08-resource-colour-system.md). Deterministic
// name -> colour mapping so the same resource always renders the same hue
// everywhere it appears (ShipMap's per-part meters today, any future
// resource widget). Pure and stateless: no registry, no memoisation needed,
// same input always produces the same output.
//
// Two tiers:
//   1. A curated substring map for resource names we know the real-world
//      kind of (water, oxidizer, food, ...). Ordered MOST-SPECIFIC-FIRST so
//      a longer/more specific alias always gets first refusal over a
//      shorter one that would also match (see CURATED's own comment). Each
//      family owns a hue BAND (a centre plus a spread), not a single hue: a
//      name that matches the family is placed at a deterministic point
//      inside the band, derived from a hash of its own full name, so a
//      family several distinct resources match (waste/wastewater/
//      carbondioxide) auto-spreads its members into distinct-but-related
//      hues with no per-member table entry.
//   2. A stateless golden-angle hash fallback for anything unrecognised
//      (mod resources, future KSP resources, typos), so an unknown resource
//      still gets a stable, well-spread, legible colour rather than one
//      shared "unknown" grey. Its reserved-zone check avoids every curated
//      family's whole band, not just its centre point.
//
// Both tiers are normalised into the SAME saturation/lightness band, so a
// curated resource and a hashed one read as one system rather than two.
// This retires the old muted `MeterTone`-as-identity workaround in ShipMap.
// ---------------------------------------------------------------------------

/** Legibility band shared by both tiers, tuned for the dark ShipMap canvas.
 *  Starter values per the design doc; tune by eye on operator review, the
 *  MECHANISM (two tiers, ordered curated match, golden-angle hash, reserved
 *  band avoidance) is what must stay correct, not these two numbers. */
const SATURATION_PCT = 65;
const LIGHTNESS_PCT = 55;

/** Golden angle in degrees: stepping a hash by this amount spreads hues
 *  maximally without ever having to track which hues are already in use. */
const GOLDEN_ANGLE_DEG = 137.508;

/** Default half-width, in degrees, of a curated family's hue band before
 *  it gets clamped down to fit the gap to its nearest neighbour (see
 *  `EFFECTIVE_SPREADS_DEG` below). Wide enough to give an open-region
 *  family (e.g. waste, with a 15deg gap to its nearest neighbour) room to
 *  spread several members apart; a crowded singleton family auto-shrinks
 *  well below this. */
const DEFAULT_SPREAD_DEG = 13;

/** Minimum gap, in degrees, kept between two adjacent family bands' edges.
 *  Small on purpose: it only has to stop bands touching, the halved
 *  nearest-neighbour-gap calculation already does the heavy lifting. The
 *  curated centres are dense enough (10deg nearest-neighbour gaps in
 *  places) that a fixed buffer on TOP of every band's edge, as Tier 2 used
 *  before bands existed, would blank out the whole circle; the band itself
 *  (sized by this margin against its neighbours) is now Tier 2's entire
 *  reserved zone, see `isWithinReservedBand`. */
const BAND_MARGIN_DEG = 1.5;

/** Hard stop on the reserved-band rotation loop: 360 / GOLDEN_ANGLE_DEG
 *  cycles back to (very nearly) the starting hue, so this is already far
 *  more attempts than a real curated hue count could ever exhaust. Exists
 *  only so a pathological future CURATED table can't hang this function. */
const MAX_ROTATIONS = 64;

/** The reserved-band escape step is DERIVED FROM THE NAME (upper bits of the
 *  same FNV-1a hash), not the fixed golden angle, and mapped into this range.
 *  Two different unknowns that both land in the same reserved band then rotate
 *  by DIFFERENT amounts and diverge, instead of converging on one hue the way a
 *  shared fixed step made them. 60..300deg: wide enough to clear a band in a
 *  step or two, never a small step that crawls. Still fully deterministic per
 *  name. */
const ESCAPE_STEP_MIN_DEG = 60;
const ESCAPE_STEP_RANGE_DEG = 241;

/** Fractional dither (~0.508deg, the golden angle's own fractional part) added
 *  to the name-derived step so it is NEVER a whole number. A whole-number step
 *  can orbit a small set of hues (step and 360 sharing a factor) that all sit
 *  in reserved bands, so the escape loop would run to its cap without ever
 *  clearing; a non-integer step's orbit never exactly repeats, so it always
 *  reaches a clear hue. */
const ESCAPE_STEP_DITHER = GOLDEN_ANGLE_DEG - Math.floor(GOLDEN_ANGLE_DEG);

/**
 * One curated family: every alias in `aliases` maps into the same hue BAND,
 * centred on `hue`. `spread` is an optional per-family override of
 * `DEFAULT_SPREAD_DEG` (nothing in the starter table needs one); the band
 * actually used is still clamped down to fit the gap to the nearest other
 * family, see `EFFECTIVE_SPREADS_DEG`. Aliases within a family don't need
 * internal ordering, but FAMILIES must be ordered most-specific-first in
 * `CURATED` below whenever one family's alias could also be a substring of
 * a different family's alias, so the more specific family wins the match.
 */
interface CuratedFamily {
  aliases: readonly string[];
  hue: number;
  spread?: number;
}

/**
 * Tier 1: curated substring matches, case-insensitive (callers normalise
 * to lower-case before matching), most-specific-first. Starter set from the
 * design doc; small and obvious on purpose, extend it rather than widen an
 * existing alias.
 *
 * `liquidfuel` is listed ahead of any future generic `fuel` alias, and
 * `electriccharge` ahead of `ec`, so a later addition of a broader alias
 * can never steal a match that a more specific one earned first; see
 * `resourceColor.test.ts`'s precedence-mechanism tests for the invariant
 * this ordering exists to protect.
 *
 * `hue` below is each family's BAND CENTRE, unchanged from the single-hue
 * values this table used to carry directly.
 */
const CURATED: readonly CuratedFamily[] = [
  { aliases: ["liquidfuel"], hue: 40 }, // amber
  { aliases: ["lqdhydrogen", "hydrogen"], hue: 205 }, // pale blue
  { aliases: ["electriccharge", "ec"], hue: 50 }, // yellow
  { aliases: ["carbondioxide", "co2", "waste"], hue: 65 }, // olive
  { aliases: ["monopropellant", "monoprop"], hue: 95 }, // yellow-green
  { aliases: ["oxidizer"], hue: 15 }, // red-orange
  { aliases: ["oxygen", "air"], hue: 190 }, // cyan
  { aliases: ["water"], hue: 215 }, // blue
  { aliases: ["ore"], hue: 28 }, // tan / brown
  { aliases: ["food"], hue: 130 }, // green
  { aliases: ["xenon"], hue: 275 }, // violet
  { aliases: ["ablator"], hue: 5 }, // grey-orange
  { aliases: ["nitrogen", "ammonia"], hue: 175 }, // teal
];

/** Shortest angular distance between two hues on the 0..360 wheel. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Each family's EFFECTIVE spread: `min(requestedSpread, halfGapToNearest
 * OtherCentre - BAND_MARGIN_DEG)`, clamped to >= 0, computed once at module
 * load from `CURATED`'s own centres. This is the mechanism that keeps bands
 * from ever overlapping without hand-tuning any individual family: an
 * open-region family (waste, with a 15deg gap down to electriccharge) gets
 * real room to spread its members apart; a family wedged between two close
 * neighbours (e.g. liquidfuel, 10deg from both electriccharge and ore)
 * auto-shrinks to a few degrees, and a maximally crowded table would shrink
 * every band to ~0 (each member effectively landing on its centre) rather
 * than colliding.
 */
const EFFECTIVE_SPREADS_DEG: readonly number[] = CURATED.map(
  (family, index) => {
    const requestedSpread = family.spread ?? DEFAULT_SPREAD_DEG;
    let nearestGap = Infinity;
    for (let other = 0; other < CURATED.length; other++) {
      if (other === index) continue;
      nearestGap = Math.min(
        nearestGap,
        hueDistance(family.hue, CURATED[other].hue),
      );
    }
    const halfGap = nearestGap / 2;
    return Math.max(0, Math.min(requestedSpread, halfGap - BAND_MARGIN_DEG));
  },
);

/**
 * Every curated family's resolved band (centre + effective spread),
 * exported so tests can assert the non-overlap invariant and per-family
 * band membership directly, without recomputing the clamp logic above.
 */
export const CURATED_BANDS: ReadonlyArray<{
  aliases: readonly string[];
  centre: number;
  spread: number;
}> = CURATED.map((family, index) => ({
  aliases: family.aliases,
  centre: family.hue,
  spread: EFFECTIVE_SPREADS_DEG[index],
}));

/**
 * Tier 1 lookup, exported (module-local, not from the package index) so the
 * ordering/precedence mechanism can be unit-tested directly against
 * synthetic tables without going through the full `resourceColor` pipeline.
 * `key` must already be lower-cased. Returns the family's BAND CENTRE;
 * `placedHue` below layers the in-band placement on top for the real
 * `CURATED` table.
 */
export function matchCuratedHue(
  key: string,
  table: readonly CuratedFamily[] = CURATED,
): number | undefined {
  const family = table.find((candidate) =>
    candidate.aliases.some((alias) => key.includes(alias)),
  );
  return family?.hue;
}

/**
 * FNV-1a, 32-bit. Deliberately NOT `String.prototype`-derived hashing or
 * anything that could vary by engine/run: FNV-1a is a fixed arithmetic
 * definition, so `resourceColor` stays deterministic across processes,
 * browsers, and time, which is the whole point of Tier 2 (and of Tier 1's
 * in-band placement below).
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Positive modulo: JS `%` keeps the sign of the dividend, which would
 *  otherwise hand back a negative "hue". */
function positiveMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * Deterministic placement of a specific resource name inside its curated
 * family's band, in `[-spread, +spread]`. Hashed with a namespaced key
 * (`band:<name>`) so this placement and Tier 2's fallback hue derive
 * independently even for a name that happens to hit both (it never does in
 * practice, Tier 1 always wins when it matches, but keeping the hash inputs
 * distinct avoids any accidental coupling). A one-member family's only
 * alias still lands ~centre (nothing else needs the room); a family several
 * distinct resource names match (waste/wastewater/carbondioxide) spreads
 * each into its own point in the band, automatically, with no per-member
 * table entry.
 */
function bandOffset(key: string, spread: number): number {
  if (spread <= 0) return 0;
  const hash = fnv1a(`band:${key}`);
  const fraction = hash / 0xffffffff;
  return (fraction * 2 - 1) * spread;
}

/**
 * Tier 1 resolved hue for a full resource name: its curated family's centre
 * plus that name's own deterministic in-band placement. `undefined` when
 * no curated family matches (falls through to Tier 2 in `resourceColor`).
 * Exported for direct testing of the band-placement mechanism.
 */
export function placedHue(key: string): number | undefined {
  const index = CURATED.findIndex((family) =>
    family.aliases.some((alias) => key.includes(alias)),
  );
  if (index === -1) return undefined;
  const family = CURATED[index];
  const spread = EFFECTIVE_SPREADS_DEG[index];
  return positiveMod(family.hue + bandOffset(key, spread), 360);
}

/**
 * A hue is "reserved" for Tier 2 purposes when it falls inside any curated
 * family's whole BAND (centre +/- effective spread), not just on the
 * family's exact centre point. This is the band model's replacement for
 * the old fixed-radius-around-a-single-point check.
 */
function isWithinReservedBand(hue: number): boolean {
  return CURATED_BANDS.some(
    ({ centre, spread }) => hueDistance(hue, centre) < spread,
  );
}

/**
 * Tier 2: stateless golden-angle hash fallback, exported for the same
 * synthetic-table testing reason as `matchCuratedHue`.
 *
 * `hue = (stableHash(name) * goldenAngle) mod 360`, then, if it lands
 * inside a curated family's whole BAND (not just the family's centre
 * point), rotated by a NAME-DERIVED step (deterministic, no randomness) as
 * many times as it takes to clear every band. The step is per-name so two
 * unknowns escaping the SAME band diverge, see `ESCAPE_STEP_MIN_DEG`'s
 * comment.
 */
export function hashHue(key: string): number {
  const hash = fnv1a(key);
  let hue = positiveMod(hash * GOLDEN_ANGLE_DEG, 360);
  // Escape step from the name's own hash (upper bits, decoupled from the
  // initial-hue derivation above), so a different name escaping the same band
  // rotates by a different amount and lands somewhere else.
  const escapeStep =
    ESCAPE_STEP_MIN_DEG +
    ((hash >>> 8) % ESCAPE_STEP_RANGE_DEG) +
    ESCAPE_STEP_DITHER;
  let rotations = 0;
  while (isWithinReservedBand(hue) && rotations < MAX_ROTATIONS) {
    hue = positiveMod(hue + escapeStep, 360);
    rotations++;
  }
  return hue;
}

/**
 * Resolve a resource name to a stable, legible fill colour. Same name ->
 * same colour always; curated names get a colour matching the real
 * resource kind (placed within that family's band), unrecognised names get
 * a well-spread hashed colour that never collides with a curated family's
 * reserved band.
 */
export function resourceColor(name: string): string {
  const key = name.trim().toLowerCase();
  const hue = placedHue(key) ?? hashHue(key);
  return `hsl(${Math.round(hue)}deg ${SATURATION_PCT}% ${LIGHTNESS_PCT}%)`;
}
