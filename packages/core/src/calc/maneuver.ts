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
  /** Degrees. Present for plane-change presets; omitted otherwise. */
  inclination?: number;
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
): {
  r: number;
  speed: number;
  flightPathAngle: number;
  trueAnomalyDeg: number;
} {
  const a = current.sma;
  const e = current.eccentricity;

  // Current true anomaly → eccentric anomaly.
  const nu0 = (currentTrueAnomalyDeg * Math.PI) / 180;
  const E0 =
    2 *
    Math.atan2(
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
  const flightPathAngle = Math.atan2(e * Math.sin(nu), 1 + e * Math.cos(nu));
  return {
    r,
    speed,
    flightPathAngle,
    trueAnomalyDeg: ((nu * 180) / Math.PI + 360) % 360,
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

// ---------------------------------------------------------------------------
// Plane-change presets
// ---------------------------------------------------------------------------

/**
 * True anomaly of the ascending / descending node for the current orbit,
 * both in degrees in [0, 360). `argumentOfPeriapsis` is the angle from the
 * ascending node to periapsis, so the AN itself sits at ν = -argPe and
 * the DN at ν = 180° - argPe (mod 360°).
 */
function nodeAnomalies(argumentOfPeriapsisDeg: number): {
  an: number;
  dn: number;
} {
  const mod360 = (x: number) => ((x % 360) + 360) % 360;
  return {
    an: mod360(-argumentOfPeriapsisDeg),
    dn: mod360(180 - argumentOfPeriapsisDeg),
  };
}

/**
 * Time from `currentTrueAnomalyDeg` forward to `targetTrueAnomalyDeg` on
 * the same orbit, in seconds. Always returns a non-negative value — if
 * the target is "behind" us, we wait for the next pass.
 */
function timeToTrueAnomaly(
  current: CurrentOrbit,
  currentTrueAnomalyDeg: number,
  targetTrueAnomalyDeg: number,
  mu: number,
): number {
  const a = current.sma;
  const e = current.eccentricity;
  const n = Math.sqrt(mu / (a * a * a));
  const period = (2 * Math.PI) / n;

  const toM = (trueAnomalyDeg: number) => {
    const nu = (trueAnomalyDeg * Math.PI) / 180;
    const E =
      2 *
      Math.atan2(
        Math.sqrt(1 - e) * Math.sin(nu / 2),
        Math.sqrt(1 + e) * Math.cos(nu / 2),
      );
    return E - e * Math.sin(E);
  };

  const dM = toM(targetTrueAnomalyDeg) - toM(currentTrueAnomalyDeg);
  let dt = dM / n;
  // Wrap forward if the target has already passed this orbit.
  while (dt < 0) dt += period;
  return dt;
}

/**
 * Match a target inclination by burning normal at the next ascending or
 * descending node (whichever is sooner). Preserves the in-plane orbit
 * shape — we only rotate the plane around the node line, which is the
 * cheapest kind of inclination change.
 *
 * `currentInclinationDeg` / `targetInclinationDeg` are absolute
 * inclinations from the body's equator (matching `o.inclination`). The
 * result's `normal` is signed: positive at an AN burn increases
 * inclination, negative decreases it — and vice-versa at the DN, so
 * "where are we?" is folded into the sign for us here.
 */
export function matchInclination(
  current: CurrentOrbit,
  currentTrueAnomalyDeg: number,
  currentArgumentOfPeriapsisDeg: number,
  currentInclinationDeg: number,
  mu: number,
  currentUT: number,
  targetInclinationDeg: number,
): ManeuverPlan {
  const nodes = nodeAnomalies(currentArgumentOfPeriapsisDeg);
  const dtAN = timeToTrueAnomaly(current, currentTrueAnomalyDeg, nodes.an, mu);
  const dtDN = timeToTrueAnomaly(current, currentTrueAnomalyDeg, nodes.dn, mu);

  // Burn at whichever node arrives first. At AN a +normal burn rotates
  // the orbit's angular-momentum vector northward → higher inclination;
  // at DN the geometry is mirrored, so the sign flips.
  const useAN = dtAN <= dtDN;
  const dt = useAN ? dtAN : dtDN;
  const nodeDirection = useAN ? 1 : -1;

  const burnUT = currentUT + dt;
  const state = stateAtUT(
    current,
    currentTrueAnomalyDeg,
    mu,
    currentUT,
    burnUT,
  );

  // Cheap plane-change formula: normal ΔV magnitude is 2·v_h·sin(Δi/2),
  // where v_h is the velocity component in the plane perpendicular to
  // the radius (i.e. horizontal). At a node γ is approximately zero for
  // circular-ish orbits, but we include the cos(γ) correction for
  // eccentric cases.
  const deltaIRad =
    ((targetInclinationDeg - currentInclinationDeg) * Math.PI) / 180;
  const vHorizontal = state.speed * Math.cos(state.flightPathAngle);
  const magnitude = 2 * vHorizontal * Math.sin(Math.abs(deltaIRad) / 2);
  const normal = nodeDirection * Math.sign(deltaIRad) * magnitude;

  return {
    ut: burnUT,
    prograde: 0,
    normal,
    radial: 0,
    requiredDeltaV: Math.abs(normal),
    projected: {
      sma: current.sma,
      eccentricity: current.eccentricity,
      ApR: current.ApR,
      PeR: current.PeR,
      period: periodAt(mu, current.sma),
      inclination: targetInclinationDeg,
    },
  };
}

/**
 * Match the full orbital plane of a target — both inclination AND LAN.
 * Burns at the intersection line of the two planes, which in general
 * is NOT the current orbit's equatorial AN/DN. Uses the relative
 * angular-momentum geometry:
 *
 *   cos(θ_rel) = cos(i₁)·cos(i₂) + sin(i₁)·sin(i₂)·cos(Ω₂ − Ω₁)
 *
 * and the standard spherical-trig formula for the argument of latitude
 * `u₁` on orbit 1 where it crosses orbit 2's plane. ΔV = 2·v_h·sin(θ_rel/2),
 * applied normal.
 *
 * Result's projected inclination is the target's — after a pure plane
 * change at the node, we lie in orbit 2's plane exactly.
 */
export function matchTargetPlane(
  current: CurrentOrbit,
  currentTrueAnomalyDeg: number,
  currentArgumentOfPeriapsisDeg: number,
  currentInclinationDeg: number,
  currentLanDeg: number,
  targetInclinationDeg: number,
  targetLanDeg: number,
  mu: number,
  currentUT: number,
): ManeuverPlan {
  const i1 = (currentInclinationDeg * Math.PI) / 180;
  const i2 = (targetInclinationDeg * Math.PI) / 180;
  const dOmega = ((targetLanDeg - currentLanDeg) * Math.PI) / 180;

  const cosRel =
    Math.cos(i1) * Math.cos(i2) +
    Math.sin(i1) * Math.sin(i2) * Math.cos(dOmega);
  const relIncRad = Math.acos(Math.max(-1, Math.min(1, cosRel)));

  // Argument of latitude on orbit 1 where it crosses orbit 2's plane
  // going "up" relative to orbit 2. Standard spherical trig — see any
  // orbital-mechanics reference on relative AN / DN between two orbits.
  const u1Rad = Math.atan2(
    Math.sin(i2) * Math.sin(dOmega),
    Math.cos(i1) * Math.sin(i2) * Math.cos(dOmega) -
      Math.sin(i1) * Math.cos(i2),
  );
  const u1Deg = ((u1Rad * 180) / Math.PI + 360) % 360;
  // argPe is the angle from our AN to periapsis, so true anomaly at the
  // relative node is u₁ − argPe.
  const nuAN = (((u1Deg - currentArgumentOfPeriapsisDeg) % 360) + 360) % 360;
  const nuDN = (nuAN + 180) % 360;

  const dtAN = timeToTrueAnomaly(current, currentTrueAnomalyDeg, nuAN, mu);
  const dtDN = timeToTrueAnomaly(current, currentTrueAnomalyDeg, nuDN, mu);
  const useAN = dtAN <= dtDN;
  const dt = useAN ? dtAN : dtDN;
  const nodeDirection = useAN ? 1 : -1;

  const burnUT = currentUT + dt;
  const state = stateAtUT(
    current,
    currentTrueAnomalyDeg,
    mu,
    currentUT,
    burnUT,
  );

  const vHorizontal = state.speed * Math.cos(state.flightPathAngle);
  const magnitude = 2 * vHorizontal * Math.sin(relIncRad / 2);
  const normal = nodeDirection * magnitude;

  return {
    ut: burnUT,
    prograde: 0,
    normal,
    radial: 0,
    requiredDeltaV: Math.abs(normal),
    projected: {
      sma: current.sma,
      eccentricity: current.eccentricity,
      ApR: current.ApR,
      PeR: current.PeR,
      period: periodAt(mu, current.sma),
      inclination: targetInclinationDeg,
    },
  };
}
