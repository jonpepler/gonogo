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
//      shorter one that would also match (see CURATED's own comment).
//   2. A stateless golden-angle hash fallback for anything unrecognised
//      (mod resources, future KSP resources, typos), so an unknown resource
//      still gets a stable, well-spread, legible colour rather than one
//      shared "unknown" grey.
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

/** How close (in degrees) a Tier-2 hashed hue is allowed to land next to a
 *  Tier-1 curated hue before it gets rotated away. Keeps an unrecognised
 *  resource from reading as "water" etc. purely by hash coincidence. */
const RESERVED_BAND_DEG = 15;

/** Hard stop on the reserved-band rotation loop: 360 / GOLDEN_ANGLE_DEG
 *  cycles back to (very nearly) the starting hue, so this is already far
 *  more attempts than a real curated hue count could ever exhaust. Exists
 *  only so a pathological future CURATED table can't hang this function. */
const MAX_ROTATIONS = 64;

/**
 * One curated family: every alias in `aliases` maps to `hue`. Aliases
 * within a family don't need internal ordering (they share a hue), but
 * FAMILIES must be ordered most-specific-first in `CURATED` below whenever
 * one family's alias could also be a substring of a different family's
 * alias, so the more specific family wins the match.
 */
interface CuratedFamily {
  aliases: readonly string[];
  hue: number;
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

/** Every distinct hue a curated family occupies, for Tier 2's reserved-band
 *  check. Computed once at module load, not per call. */
const CURATED_HUES: readonly number[] = Array.from(
  new Set(CURATED.map((family) => family.hue)),
);

/**
 * Tier 1 lookup, exported (module-local, not from the package index) so the
 * ordering/precedence mechanism can be unit-tested directly against
 * synthetic tables without going through the full `resourceColor` pipeline.
 * `key` must already be lower-cased.
 */
export function matchCuratedHue(
  key: string,
  table: readonly CuratedFamily[] = CURATED,
): number | undefined {
  for (const family of table) {
    if (family.aliases.some((alias) => key.includes(alias))) {
      return family.hue;
    }
  }
  return undefined;
}

/**
 * FNV-1a, 32-bit. Deliberately NOT `String.prototype`-derived hashing or
 * anything that could vary by engine/run: FNV-1a is a fixed arithmetic
 * definition, so `resourceColor` stays deterministic across processes,
 * browsers, and time, which is the whole point of Tier 2.
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

/** Shortest angular distance between two hues on the 0..360 wheel. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isWithinReservedBand(hue: number): boolean {
  return CURATED_HUES.some(
    (curatedHue) => hueDistance(hue, curatedHue) < RESERVED_BAND_DEG,
  );
}

/**
 * Tier 2: stateless golden-angle hash fallback, exported for the same
 * synthetic-table testing reason as `matchCuratedHue`.
 *
 * `hue = (stableHash(name) * goldenAngle) mod 360`, then rotated by the
 * golden angle again (deterministically, no randomness) as many times as
 * it takes to clear every curated hue's reserved band.
 */
export function hashHue(key: string): number {
  const seed = fnv1a(key) * GOLDEN_ANGLE_DEG;
  let hue = positiveMod(seed, 360);
  let rotations = 0;
  while (isWithinReservedBand(hue) && rotations < MAX_ROTATIONS) {
    hue = positiveMod(hue + GOLDEN_ANGLE_DEG, 360);
    rotations++;
  }
  return hue;
}

/**
 * Resolve a resource name to a stable, legible fill colour. Same name ->
 * same colour always; curated names get a colour matching the real
 * resource kind, unrecognised names get a well-spread hashed colour that
 * never collides with a curated hue's reserved band.
 */
export function resourceColor(name: string): string {
  const key = name.trim().toLowerCase();
  const hue = matchCuratedHue(key) ?? hashHue(key);
  return `hsl(${Math.round(hue)}deg ${SATURATION_PCT}% ${LIGHTNESS_PCT}%)`;
}
