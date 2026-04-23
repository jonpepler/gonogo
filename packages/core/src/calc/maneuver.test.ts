import { describe, expect, it } from "vitest";
import {
  circularizeAtApo,
  circularizeAtPeri,
  type CurrentOrbit,
  customAtApsis,
  gravParameterFromState,
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
    const plan = customAtApsis(
      KERBIN_ELLIPTIC,
      KERBIN_MU,
      0,
      "apo",
      0,
      0,
      0,
    );
    expect(plan.requiredDeltaV).toBe(0);
    expect(plan.projected?.ApR).toBeCloseTo(KERBIN_ELLIPTIC.ApR, -2);
    expect(plan.projected?.PeR).toBeCloseTo(KERBIN_ELLIPTIC.PeR, -2);
    expect(plan.projected?.eccentricity).toBeCloseTo(
      KERBIN_ELLIPTIC.eccentricity,
      5,
    );
  });

  it("retrograde at apoapsis lowers periapsis", () => {
    const plan = customAtApsis(
      KERBIN_ELLIPTIC,
      KERBIN_MU,
      0,
      "apo",
      -50,
      0,
      0,
    );
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
    const plan = customAtApsis(
      KERBIN_ELLIPTIC,
      KERBIN_MU,
      0,
      "apo",
      0,
      120,
      0,
    );
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
