/**
 * Maneuver preset solvers — pure functions over Keplerian elements.
 *
 * All solvers return a `ManeuverPlan` with ΔV components (prograde, normal,
 * radial) in m/s, an absolute UT for the burn, and a projected post-burn
 * orbit for preview. No side effects, no data-source access — call sites
 * feed in a `CurrentOrbit` snapshot and μ (gravitational parameter).
 *
 * μ availability: KSP body μ isn't carried on BodyDefinition, so derive it
 * from live telemetry with `gravParameterFromState(v, r, a)` — the
 * vis-viva equation gives an exact answer from any point on the orbit.
 *
 * Scope: V1 presets burn at a named apsis (apo / peri). Arbitrary-UT burns
 * need orbit propagation to find state at the burn point — that's a
 * follow-up, trajectory.ts already has the primitive (`patchStateAt`).
 */

/** Orbit snapshot taken from Telemachus `o.*` keys. All distances in metres. */
export interface CurrentOrbit {
  /** Semi-major axis. */
  sma: number;
  /** Eccentricity [0, 1). */
  eccentricity: number;
  /** Apoapsis distance from body centre. */
  ApR: number;
  /** Periapsis distance from body centre. */
  PeR: number;
  /** Seconds until vessel reaches apoapsis. */
  timeToAp: number;
  /** Seconds until vessel reaches periapsis. */
  timeToPe: number;
}

/** Resulting orbit shape after a maneuver — for preview, not execution. */
export interface ProjectedOrbit {
  sma: number;
  eccentricity: number;
  ApR: number;
  PeR: number;
  /** Seconds. */
  period: number;
}

export interface ManeuverPlan {
  /** Absolute UT for the burn (seconds). */
  ut: number;
  /** ΔV along the velocity vector (m/s). Positive raises, negative lowers. */
  prograde: number;
  /** ΔV perpendicular to the orbital plane (m/s). */
  normal: number;
  /** ΔV along the radius (m/s). Positive is outward from the body. */
  radial: number;
  /** Magnitude `√(p² + n² + r²)`. */
  requiredDeltaV: number;
  /** In-plane projected orbit after the burn, or null if inputs are invalid. */
  projected: ProjectedOrbit | null;
}

export type Apsis = "apo" | "peri";

// ---------------------------------------------------------------------------
// Vis-viva helpers
// ---------------------------------------------------------------------------

/**
 * Gravitational parameter μ (m³/s²) derived from a single point on an orbit.
 * Uses vis-viva rearranged: `μ = v²·a·r / (2a − r)`. Any point works; the
 * easiest is the current vessel position from live telemetry.
 */
export function gravParameterFromState(
  orbitalSpeed: number,
  radius: number,
  sma: number,
): number {
  const denom = 2 * sma - radius;
  if (!(denom > 0)) return 0;
  return (orbitalSpeed * orbitalSpeed * sma * radius) / denom;
}

/** Vis-viva: speed at radius `r` on an orbit with semi-major axis `a`. */
function speedAt(mu: number, r: number, a: number): number {
  return Math.sqrt(mu * (2 / r - 1 / a));
}

/** Circular-orbit speed at radius `r`. */
function circularSpeed(mu: number, r: number): number {
  return Math.sqrt(mu / r);
}

function periodAt(mu: number, sma: number): number {
  if (!(sma > 0)) return 0;
  return 2 * Math.PI * Math.sqrt((sma * sma * sma) / mu);
}

/**
 * Shape of the post-burn orbit given the burn happens at an apsis (γ = 0
 * before the burn). Handles prograde + radial in-plane; normal tilts the
 * plane but doesn't reshape it, so we ignore it for projected-orbit
 * purposes (the widget shows plane-change notes separately).
 */
function projectAtApsis(
  apsisR: number,
  currentSma: number,
  mu: number,
  prograde: number,
  radial: number,
): ProjectedOrbit | null {
  // Pre-burn speed at the apsis (γ = 0 by definition at an apsis).
  const vPre = speedAt(mu, apsisR, currentSma);
  const vProg = vPre + prograde;
  const vInPlane = Math.hypot(vProg, radial);
  if (!Number.isFinite(vInPlane)) return null;

  // Specific orbital energy → new sma.
  const epsilon = (vInPlane * vInPlane) / 2 - mu / apsisR;
  if (epsilon >= 0) return null; // escaped / parabolic — out of scope for V1
  const newSma = -mu / (2 * epsilon);

  // Specific angular momentum uses the horizontal component of velocity.
  // gamma from horizontal = atan2(radial, vProg); horizontal speed = cos(gamma)·|v|.
  const gamma = Math.atan2(radial, vProg);
  const h = apsisR * vInPlane * Math.cos(gamma);
  const eSquared = 1 + (2 * epsilon * h * h) / (mu * mu);
  const newEcc = Math.sqrt(Math.max(0, eSquared));

  return {
    sma: newSma,
    eccentricity: newEcc,
    ApR: newSma * (1 + newEcc),
    PeR: newSma * (1 - newEcc),
    period: periodAt(mu, newSma),
  };
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Circularise the orbit at apoapsis. Pure prograde burn; ΔV is the
 * difference between the current apoapsis speed and the circular speed
 * at that radius.
 */
export function circularizeAtApo(
  current: CurrentOrbit,
  mu: number,
  currentUT: number,
): ManeuverPlan {
  const r = current.ApR;
  const vCurrent = speedAt(mu, r, current.sma);
  const vTarget = circularSpeed(mu, r);
  const prograde = vTarget - vCurrent;
  return {
    ut: currentUT + current.timeToAp,
    prograde,
    normal: 0,
    radial: 0,
    requiredDeltaV: Math.abs(prograde),
    projected: {
      sma: r,
      eccentricity: 0,
      ApR: r,
      PeR: r,
      period: periodAt(mu, r),
    },
  };
}

/** Circularise at periapsis. Mirror of {@link circularizeAtApo}. */
export function circularizeAtPeri(
  current: CurrentOrbit,
  mu: number,
  currentUT: number,
): ManeuverPlan {
  const r = current.PeR;
  const vCurrent = speedAt(mu, r, current.sma);
  const vTarget = circularSpeed(mu, r);
  const prograde = vTarget - vCurrent;
  return {
    ut: currentUT + current.timeToPe,
    prograde,
    normal: 0,
    radial: 0,
    requiredDeltaV: Math.abs(prograde),
    projected: {
      sma: r,
      eccentricity: 0,
      ApR: r,
      PeR: r,
      period: periodAt(mu, r),
    },
  };
}

/**
 * Arbitrary ΔV components burned at the next apoapsis or periapsis.
 * All three components (prograde/normal/radial) are carried through to the
 * plan so the widget can commit them; the projected orbit reflects
 * prograde + radial only (the normal component tilts the plane and doesn't
 * reshape the in-plane orbit at an apsis).
 */
export function customAtApsis(
  current: CurrentOrbit,
  mu: number,
  currentUT: number,
  apsis: Apsis,
  prograde: number,
  normal: number,
  radial: number,
): ManeuverPlan {
  const r = apsis === "apo" ? current.ApR : current.PeR;
  const dt = apsis === "apo" ? current.timeToAp : current.timeToPe;
  const projected = projectAtApsis(r, current.sma, mu, prograde, radial);
  return {
    ut: currentUT + dt,
    prograde,
    normal,
    radial,
    requiredDeltaV: Math.hypot(prograde, normal, radial),
    projected,
  };
}
