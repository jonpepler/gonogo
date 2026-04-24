import { describe, expect, it } from "vitest";
import {
  type CurrentOrbit,
  circularizeAtApo,
  circularizeAtPeri,
  customAtApsis,
  customAtUT,
  gravParameterFromState,
  matchInclination,
  matchTargetPlane,
  stateAtUT,
} from "./maneuver";

// Kerbin's gravitational parameter (m³/s²).
const KERBIN_MU = 3.5316e12;
// Equatorial radius in metres.
const KERBIN_R = 600_000;

/**
 * 100 km circular orbit at Kerbin. Used as a neutral "no-op" baseline —
 * circularising a circle should give ~zero ΔV.
 */
const KERBIN_100KM_CIRCULAR: CurrentOrbit = {
  sma: KERBIN_R + 100_000,
  eccentricity: 0,
  ApR: KERBIN_R + 100_000,
  PeR: KERBIN_R + 100_000,
  timeToAp: 0,
  timeToPe: 0,
};

/**
 * Elliptic orbit with 80 km peri, 150 km apo. The circularise-at-apo
 * preset should burn prograde to raise the peri to the apo altitude.
 */
const KERBIN_ELLIPTIC: CurrentOrbit = {
  sma: KERBIN_R + (80_000 + 150_000) / 2,
  eccentricity: (150_000 - 80_000) / (2 * KERBIN_R + 80_000 + 150_000),
  ApR: KERBIN_R + 150_000,
  PeR: KERBIN_R + 80_000,
  timeToAp: 600,
  timeToPe: 1000,
};

describe("gravParameterFromState", () => {
  it("recovers μ from a circular orbit's v and r", () => {
    // For a circular orbit v = √(μ/r), so μ = v²·r.
    const r = 700_000;
    const v = Math.sqrt(KERBIN_MU / r);
    const mu = gravParameterFromState(v, r, r);
    expect(mu).toBeCloseTo(KERBIN_MU, -3);
  });

  it("recovers μ from a point on an elliptic orbit", () => {
    const a = KERBIN_ELLIPTIC.sma;
    const r = KERBIN_ELLIPTIC.ApR;
    const v = Math.sqrt(KERBIN_MU * (2 / r - 1 / a));
    const mu = gravParameterFromState(v, r, a);
    expect(mu).toBeCloseTo(KERBIN_MU, -3);
  });
});

describe("circularizeAtApo", () => {
  it("needs ~zero ΔV for an already-circular orbit", () => {
    const plan = circularizeAtApo(KERBIN_100KM_CIRCULAR, KERBIN_MU, 0);
    expect(Math.abs(plan.prograde)).toBeLessThan(1e-6);
    expect(plan.requiredDeltaV).toBeLessThan(1e-6);
  });

  it("returns a positive prograde burn to circularise an elliptic orbit", () => {
    const plan = circularizeAtApo(KERBIN_ELLIPTIC, KERBIN_MU, 1000);
    expect(plan.prograde).toBeGreaterThan(0);
    expect(plan.ut).toBe(1000 + KERBIN_ELLIPTIC.timeToAp);
    expect(plan.normal).toBe(0);
    expect(plan.radial).toBe(0);
  });

  it("projects a circular post-burn orbit at the apoapsis radius", () => {
    const plan = circularizeAtApo(KERBIN_ELLIPTIC, KERBIN_MU, 0);
    expect(plan.projected).not.toBeNull();
    expect(plan.projected?.eccentricity).toBe(0);
    expect(plan.projected?.sma).toBe(KERBIN_ELLIPTIC.ApR);
    expect(plan.projected?.ApR).toBe(KERBIN_ELLIPTIC.ApR);
    expect(plan.projected?.PeR).toBe(KERBIN_ELLIPTIC.ApR);
  });
});

describe("circularizeAtPeri", () => {
  it("returns a negative prograde burn when peri is below apo", () => {
    // Circularising at the low point requires braking — the orbit is moving
    // too fast for a circle at that radius.
    const plan = circularizeAtPeri(KERBIN_ELLIPTIC, KERBIN_MU, 0);
    expect(plan.prograde).toBeLessThan(0);
    expect(plan.requiredDeltaV).toBe(Math.abs(plan.prograde));
  });

  it("projects a circle at periapsis radius", () => {
    const plan = circularizeAtPeri(KERBIN_ELLIPTIC, KERBIN_MU, 0);
    expect(plan.projected?.eccentricity).toBe(0);
    expect(plan.projected?.sma).toBe(KERBIN_ELLIPTIC.PeR);
  });
});

describe("customAtApsis", () => {
  it("produces an unchanged orbit for a zero-ΔV plan", () => {
    const plan = customAtApsis(KERBIN_ELLIPTIC, KERBIN_MU, 0, "apo", 0, 0, 0);
    expect(plan.requiredDeltaV).toBe(0);
    expect(plan.projected?.ApR).toBeCloseTo(KERBIN_ELLIPTIC.ApR, -2);
    expect(plan.projected?.PeR).toBeCloseTo(KERBIN_ELLIPTIC.PeR, -2);
    expect(plan.projected?.eccentricity).toBeCloseTo(
      KERBIN_ELLIPTIC.eccentricity,
      5,
    );
  });

  it("retrograde at apoapsis lowers periapsis", () => {
    const plan = customAtApsis(KERBIN_ELLIPTIC, KERBIN_MU, 0, "apo", -50, 0, 0);
    expect(plan.projected?.PeR).toBeLessThan(KERBIN_ELLIPTIC.PeR);
    // Apoapsis unchanged — the burn happens AT apoapsis, and prograde burns
    // at apoapsis change only the opposite apsis.
    expect(plan.projected?.ApR).toBeCloseTo(KERBIN_ELLIPTIC.ApR, -1);
  });

  it("prograde at periapsis raises apoapsis", () => {
    const plan = customAtApsis(
      KERBIN_ELLIPTIC,
      KERBIN_MU,
      0,
      "peri",
      100,
      0,
      0,
    );
    expect(plan.projected?.ApR).toBeGreaterThan(KERBIN_ELLIPTIC.ApR);
    expect(plan.projected?.PeR).toBeCloseTo(KERBIN_ELLIPTIC.PeR, -1);
  });

  it("carries normal component through but doesn't reshape in-plane orbit", () => {
    const plan = customAtApsis(KERBIN_ELLIPTIC, KERBIN_MU, 0, "apo", 0, 120, 0);
    expect(plan.normal).toBe(120);
    expect(plan.requiredDeltaV).toBeCloseTo(120, 5);
    expect(plan.projected?.ApR).toBeCloseTo(KERBIN_ELLIPTIC.ApR, -1);
    expect(plan.projected?.PeR).toBeCloseTo(KERBIN_ELLIPTIC.PeR, -1);
  });

  it("returns null projection when the burn escapes (hyperbolic)", () => {
    // Huge prograde kick at apo should push past escape velocity.
    const plan = customAtApsis(
      KERBIN_ELLIPTIC,
      KERBIN_MU,
      0,
      "apo",
      5000,
      0,
      0,
    );
    expect(plan.projected).toBeNull();
  });
});

describe("stateAtUT", () => {
  it("recovers the current state when dt = 0", () => {
    // True anomaly 0 = at periapsis on the elliptic orbit.
    const s = stateAtUT(KERBIN_ELLIPTIC, 0, KERBIN_MU, 0, 0);
    expect(s.r).toBeCloseTo(KERBIN_ELLIPTIC.PeR, -1);
    // At periapsis γ = 0.
    expect(s.flightPathAngle).toBeCloseTo(0, 6);
  });

  it("returns to the same state after one full period", () => {
    const a = KERBIN_ELLIPTIC.sma;
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / KERBIN_MU);
    const at0 = stateAtUT(KERBIN_ELLIPTIC, 30, KERBIN_MU, 0, 0);
    const at1 = stateAtUT(KERBIN_ELLIPTIC, 30, KERBIN_MU, 0, period);
    expect(at1.r).toBeCloseTo(at0.r, -1);
    expect(at1.speed).toBeCloseTo(at0.speed, -1);
    expect(at1.flightPathAngle).toBeCloseTo(at0.flightPathAngle, 4);
  });

  it("returns constant r / speed and γ=0 on a circular orbit", () => {
    const s0 = stateAtUT(KERBIN_100KM_CIRCULAR, 0, KERBIN_MU, 0, 0);
    const s1 = stateAtUT(KERBIN_100KM_CIRCULAR, 0, KERBIN_MU, 0, 500);
    expect(s1.r).toBeCloseTo(s0.r, -1);
    expect(s1.speed).toBeCloseTo(s0.speed, -1);
    expect(s1.flightPathAngle).toBeCloseTo(0, 6);
  });

  it("reaches apoapsis r when propagated by timeToAp from periapsis", () => {
    // True anomaly 0° = periapsis. Half a period later we're at apoapsis.
    const a = KERBIN_ELLIPTIC.sma;
    const halfPeriod = Math.PI * Math.sqrt((a * a * a) / KERBIN_MU);
    const s = stateAtUT(KERBIN_ELLIPTIC, 0, KERBIN_MU, 0, halfPeriod);
    expect(s.r).toBeCloseTo(KERBIN_ELLIPTIC.ApR, -1);
    expect(s.flightPathAngle).toBeCloseTo(0, 4);
  });
});

describe("customAtUT", () => {
  it("is a no-op for zero ΔV at any future UT", () => {
    const plan = customAtUT(KERBIN_ELLIPTIC, 30, KERBIN_MU, 0, 800, 0, 0, 0);
    expect(plan.projected).not.toBeNull();
    expect(plan.projected?.sma).toBeCloseTo(KERBIN_ELLIPTIC.sma, -2);
    expect(plan.projected?.eccentricity).toBeCloseTo(
      KERBIN_ELLIPTIC.eccentricity,
      4,
    );
  });

  it("matches customAtApsis when burnUT lands on the next apoapsis", () => {
    const currentUT = 1000;
    // Start at periapsis (trueAnomaly = 0). Apoapsis is half a period later.
    const a = KERBIN_ELLIPTIC.sma;
    const halfPeriod = Math.PI * Math.sqrt((a * a * a) / KERBIN_MU);
    const orbit: CurrentOrbit = { ...KERBIN_ELLIPTIC, timeToAp: halfPeriod };
    const apoPlan = customAtApsis(
      orbit,
      KERBIN_MU,
      currentUT,
      "apo",
      -100,
      0,
      0,
    );
    const utPlan = customAtUT(
      orbit,
      0,
      KERBIN_MU,
      currentUT,
      currentUT + halfPeriod,
      -100,
      0,
      0,
    );
    expect(utPlan.ut).toBe(apoPlan.ut);
    expect(utPlan.projected?.ApR).toBeCloseTo(apoPlan.projected?.ApR ?? 0, -1);
    expect(utPlan.projected?.PeR).toBeCloseTo(apoPlan.projected?.PeR ?? 0, -1);
    expect(utPlan.projected?.eccentricity).toBeCloseTo(
      apoPlan.projected?.eccentricity ?? 0,
      4,
    );
  });

  it("yields a non-zero flight-path-angle projection mid-orbit", () => {
    // Partway between peri and apo: γ is non-zero, so the in-plane math
    // exercises the full projectBurn (not just the apsis shortcut).
    const a = KERBIN_ELLIPTIC.sma;
    const quarterPeriod = (Math.PI / 2) * Math.sqrt((a * a * a) / KERBIN_MU);
    const plan = customAtUT(
      KERBIN_ELLIPTIC,
      0,
      KERBIN_MU,
      0,
      quarterPeriod,
      50,
      0,
      0,
    );
    expect(plan.projected).not.toBeNull();
    // Prograde boost away from an apsis raises sma.
    expect(plan.projected?.sma).toBeGreaterThan(KERBIN_ELLIPTIC.sma);
  });

  it("refuses to plan burns in the past", () => {
    const plan = customAtUT(
      KERBIN_ELLIPTIC,
      0,
      KERBIN_MU,
      1000,
      500,
      100,
      0,
      0,
    );
    expect(plan.projected).toBeNull();
    expect(plan.ut).toBe(500);
    expect(plan.requiredDeltaV).toBe(100);
  });
});

describe("matchInclination", () => {
  it("requires ~zero ΔV when the target equals the current inclination", () => {
    const plan = matchInclination(
      KERBIN_100KM_CIRCULAR,
      0, // ν
      0, // argPe (AN at ν = 0)
      45, // current inc
      KERBIN_MU,
      0,
      45, // same target
    );
    expect(Math.abs(plan.normal)).toBeLessThan(1e-6);
    expect(plan.prograde).toBe(0);
    expect(plan.radial).toBe(0);
    expect(plan.projected?.inclination).toBe(45);
  });

  it("matches the textbook pure-inclination formula on a circular orbit", () => {
    // 100 km Kerbin circular: v ≈ sqrt(μ/r)
    const r = KERBIN_100KM_CIRCULAR.sma;
    const v = Math.sqrt(KERBIN_MU / r);
    const deltaIRad = (30 * Math.PI) / 180;
    const expected = 2 * v * Math.sin(deltaIRad / 2);

    const plan = matchInclination(
      KERBIN_100KM_CIRCULAR,
      0,
      0,
      0, // current inc
      KERBIN_MU,
      0,
      30, // target +30°
    );
    expect(Math.abs(plan.normal)).toBeCloseTo(expected, 0);
    expect(plan.projected?.inclination).toBe(30);
  });

  it("reverses the normal sign when the target inclination is lower", () => {
    const planUp = matchInclination(
      KERBIN_100KM_CIRCULAR,
      0,
      0,
      0,
      KERBIN_MU,
      0,
      30,
    );
    const planDown = matchInclination(
      KERBIN_100KM_CIRCULAR,
      0,
      0,
      30,
      KERBIN_MU,
      0,
      0,
    );
    // Same geometry → same magnitude, opposite sign.
    expect(Math.abs(planUp.normal + planDown.normal)).toBeLessThan(1e-6);
  });

  it("schedules the burn at the nearer of AN / DN", () => {
    // argPe = 0 → AN at ν = 0, DN at ν = 180. Current ν just past AN →
    // DN is nearer.
    const plan = matchInclination(
      KERBIN_100KM_CIRCULAR,
      10, // current ν just past AN
      0, // argPe
      0,
      KERBIN_MU,
      1000,
      10,
    );
    // ν needs to reach 180° (DN). On a circular orbit with period T,
    // that takes roughly (170°/360°)·T seconds.
    const period =
      2 * Math.PI * Math.sqrt(KERBIN_100KM_CIRCULAR.sma ** 3 / KERBIN_MU);
    const expectedDt = (170 / 360) * period;
    expect(plan.ut - 1000).toBeCloseTo(expectedDt, -1);
  });
});

describe("matchTargetPlane", () => {
  it("requires ~zero ΔV when the target plane equals the current plane", () => {
    const plan = matchTargetPlane(
      KERBIN_100KM_CIRCULAR,
      45, // ν
      20, // argPe
      30, // inc
      50, // LAN
      30, // target inc (same)
      50, // target LAN (same)
      KERBIN_MU,
      0,
    );
    expect(Math.abs(plan.normal)).toBeLessThan(1e-6);
    expect(plan.requiredDeltaV).toBeLessThan(1e-6);
  });

  it("reduces to pure inclination change when LAN matches", () => {
    // Same LAN → the relative-plane intersection is our own AN/DN line,
    // so matchTargetPlane should produce the same ΔV as matchInclination.
    const targetInc = 30;
    const tp = matchTargetPlane(
      KERBIN_100KM_CIRCULAR,
      10,
      0,
      0,
      0,
      targetInc,
      0,
      KERBIN_MU,
      0,
    );
    const mi = matchInclination(
      KERBIN_100KM_CIRCULAR,
      10,
      0,
      0,
      KERBIN_MU,
      0,
      targetInc,
    );
    expect(Math.abs(tp.normal)).toBeCloseTo(Math.abs(mi.normal), 0);
  });

  it("produces a non-zero ΔV when only LAN differs", () => {
    const plan = matchTargetPlane(
      KERBIN_100KM_CIRCULAR,
      0,
      0,
      10, // non-zero inc so the LAN distinction matters geometrically
      0,
      10,
      45, // LAN shifted 45° → relative plane differs
      KERBIN_MU,
      0,
    );
    expect(plan.requiredDeltaV).toBeGreaterThan(0);
    expect(plan.projected?.inclination).toBe(10);
  });
});
