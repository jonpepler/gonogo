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
 * Frame convention: ΔV components are in Telemachus's maneuver-node frame
 * — prograde along velocity, radial along +r̂ (outward from body), normal
 * perpendicular to the orbital plane. The projected-orbit math handles
 * arbitrary flight-path angle; plane change from a non-zero normal is
 * carried through but not reflected in the projected in-plane shape.
 */

import { eccentricToTrueAnomaly, solveKepler } from "./trajectory";

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
 * Shape of the post-burn orbit given an in-plane state at the burn point.
 * Decomposes the pre-burn velocity into horizontal + radial components
 * using the flight-path angle, adds the ΔV (prograde along velocity +
 * radial along +r̂), then derives the new sma/ecc from specific energy
 * and angular momentum. Normal components are the caller's responsibility
 * — they tilt the plane without reshaping the in-plane orbit.
 *
 * Returns null when the burn puts the vessel on an escape / parabolic
 * trajectory (non-negative specific energy) — V1 previews only support
 * elliptic post-burn orbits.
 */
function projectBurn(
  r: number,
  vPre: number,
  gamma: number,
  mu: number,
  prograde: number,
  radial: number,
): ProjectedOrbit | null {
  // Pre-burn velocity in (horizontal, radial) frame. "Horizontal" is in
  // the orbital plane, perpendicular to the radius vector.
  const cosG = Math.cos(gamma);
  const sinG = Math.sin(gamma);

  // Prograde ΔV lies along the pre-burn velocity direction (cosG, sinG).
  // Radial ΔV lies along +r̂ = (0, 1) in the (h, r) frame.
  const vH = vPre * cosG + prograde * cosG;
  const vR = vPre * sinG + prograde * sinG + radial;

  const vMag = Math.hypot(vH, vR);
  if (!Number.isFinite(vMag)) return null;

  const epsilon = (vMag * vMag) / 2 - mu / r;
  if (epsilon >= 0) return null;
  const newSma = -mu / (2 * epsilon);

  // Angular momentum per unit mass = r × v; only the horizontal velocity
  // component contributes.
  const h = r * vH;
  const e2 = 1 + (2 * epsilon * h * h) / (mu * mu);
  const newEcc = Math.sqrt(Math.max(0, e2));

  return {
    sma: newSma,
    eccentricity: newEcc,
    ApR: newSma * (1 + newEcc),
    PeR: newSma * (1 - newEcc),
    period: periodAt(mu, newSma),
  };
}

/**
 * Analytically propagate a point on a Keplerian orbit to an arbitrary UT.
 * Returns scalar in-plane state at the target UT — enough to feed
 * `projectBurn`. Does not attempt SOI transitions; burns that cross a
 * patch boundary need `trajectory.patchStateAt` on the right patch
 * instead.
 */
export function stateAtUT(
  current: CurrentOrbit,
  currentTrueAnomalyDeg: number,
  mu: number,
  currentUT: number,
  targetUT: number,
): { r: number; speed: number; flightPathAngle: number } {
  const a = current.sma;
  const e = current.eccentricity;

  // Current true anomaly → eccentric anomaly.
  const nu0 = (currentTrueAnomalyDeg * Math.PI) / 180;
  const E0 = 2 * Math.atan2(
    Math.sqrt(1 - e) * Math.sin(nu0 / 2),
    Math.sqrt(1 + e) * Math.cos(nu0 / 2),
  );
  // Mean anomaly propagates linearly with time.
  const M0 = E0 - e * Math.sin(E0);
  const n = Math.sqrt(mu / (a * a * a));
  const M = M0 + n * (targetUT - currentUT);

  const E = solveKepler(M, e);
  const nu = eccentricToTrueAnomaly(E, e);

  const r = a * (1 - e * Math.cos(E));
  const speed = Math.sqrt(mu * (2 / r - 1 / a));
  // γ from local horizontal: tan(γ) = e·sin(ν) / (1 + e·cos(ν)).
  const flightPathAngle = Math.atan2(
    e * Math.sin(nu),
    1 + e * Math.cos(nu),
  );
  return { r, speed, flightPathAngle };
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
  // At an apsis γ = 0 by definition — velocity is perpendicular to radius.
  const vPre = speedAt(mu, r, current.sma);
  const projected = projectBurn(r, vPre, 0, mu, prograde, radial);
  return {
    ut: currentUT + dt,
    prograde,
    normal,
    radial,
    requiredDeltaV: Math.hypot(prograde, normal, radial),
    projected,
  };
}

/**
 * Arbitrary ΔV at an arbitrary UT. Propagates the current orbit to the
 * burn point with `stateAtUT` so the projected shape reflects the real
 * flight-path angle at that point (unlike the apsis presets which assume
 * γ = 0). `currentTrueAnomalyDeg` is Telemachus's `o.trueAnomaly` at
 * `currentUT`.
 *
 * If `burnUT <= currentUT`, projected is null — we can't plan a burn in
 * the past.
 */
export function customAtUT(
  current: CurrentOrbit,
  currentTrueAnomalyDeg: number,
  mu: number,
  currentUT: number,
  burnUT: number,
  prograde: number,
  normal: number,
  radial: number,
): ManeuverPlan {
  if (burnUT <= currentUT) {
    return {
      ut: burnUT,
      prograde,
      normal,
      radial,
      requiredDeltaV: Math.hypot(prograde, normal, radial),
      projected: null,
    };
  }
  const { r, speed, flightPathAngle } = stateAtUT(
    current,
    currentTrueAnomalyDeg,
    mu,
    currentUT,
    burnUT,
  );
  const projected = projectBurn(
    r,
    speed,
    flightPathAngle,
    mu,
    prograde,
    radial,
  );
  return {
    ut: burnUT,
    prograde,
    normal,
    radial,
    requiredDeltaV: Math.hypot(prograde, normal, radial),
    projected,
  };
}
