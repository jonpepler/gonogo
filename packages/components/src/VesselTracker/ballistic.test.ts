import { describe, expect, it } from "vitest";
import { ballisticState } from "./ballistic";

const KERBIN_MU = 3.5316e12;
const KERBIN_R = 600_000;

/**
 * The ballistic half of the envelope: where the craft is if it did not
 * manoeuvre, propagated from the last elements that reached us. It is a POINT,
 * and the spec is explicit that a point is the honest depiction only until a
 * delta-V source exists to bound a volume, so nothing here pretends to more.
 */
describe("ballisticState", () => {
  const circular100km = {
    sma: KERBIN_R + 100_000,
    ecc: 0,
    mu: KERBIN_MU,
    bodyRadius: KERBIN_R,
    radiusFromCentre: KERBIN_R + 100_000,
  };

  it("reports apsides as altitudes above the surface, not radii from the centre", () => {
    // A 700 km apoapsis on a 600 km body is 100 km up. Reporting the radius
    // would be a true number about the wrong quantity.
    const state = ballisticState(circular100km);
    expect(state.apoapsis).toBeCloseTo(100_000, 3);
    expect(state.periapsis).toBeCloseTo(100_000, 3);
    expect(state.altitude).toBeCloseTo(100_000, 3);
  });

  it("derives the orbital period from the elements", () => {
    const state = ballisticState(circular100km);
    // 2π√(a³/μ) for a 700 km circular Kerbin orbit: about 32.6 minutes.
    expect(state.periodSeconds).toBeCloseTo(1958.1, 0);
  });

  it("splits the apsides on an eccentric orbit", () => {
    const state = ballisticState({
      ...circular100km,
      sma: 1_000_000,
      ecc: 0.3,
    });
    expect(state.periapsis).toBeCloseTo(100_000, 3);
    expect(state.apoapsis).toBeCloseTo(700_000, 3);
  });

  it("reports no apoapsis and no period on an escape trajectory", () => {
    // A hyperbolic orbit has neither. Rendering a number for them would be a
    // fabrication, and a negative semi-major axis quietly produces one.
    const state = ballisticState({
      ...circular100km,
      sma: -1_000_000,
      ecc: 1.4,
    });
    expect(state.apoapsis).toBeNull();
    expect(state.periodSeconds).toBeNull();
    expect(state.periapsis).toBeCloseTo(-200_000, 3);
  });

  it("withholds altitudes when the body's radius is not known", () => {
    // The body table may not have arrived. An altitude measured from an
    // assumed radius is worse than no altitude.
    const state = ballisticState({ ...circular100km, bodyRadius: null });
    expect(state.altitude).toBeNull();
    expect(state.apoapsis).toBeNull();
    expect(state.periapsis).toBeNull();
    // The period needs no radius, so it survives.
    expect(state.periodSeconds).toBeCloseTo(1958.1, 0);
  });

  it("withholds the current altitude when nothing has been propagated yet", () => {
    const state = ballisticState({ ...circular100km, radiusFromCentre: null });
    expect(state.altitude).toBeNull();
    expect(state.apoapsis).toBeCloseTo(100_000, 3);
  });

  it("withholds the period when the gravitational parameter is missing", () => {
    const state = ballisticState({ ...circular100km, mu: 0 });
    expect(state.periodSeconds).toBeNull();
  });

  it("returns nothing at all rather than NaN for a non-finite element set", () => {
    const state = ballisticState({
      ...circular100km,
      sma: Number.NaN,
      ecc: Number.NaN,
    });
    expect(state.apoapsis).toBeNull();
    expect(state.periapsis).toBeNull();
    expect(state.periodSeconds).toBeNull();
  });
});
