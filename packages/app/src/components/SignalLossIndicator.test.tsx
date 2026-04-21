import { describe, expect, it } from "vitest";
import { deriveState } from "./SignalLossIndicator";

describe("SignalLossIndicator — deriveState", () => {
  it("treats absent telemetry as connected (warmup hides the banner)", () => {
    expect(deriveState(undefined, undefined, false)).toBe("connected");
    expect(deriveState(undefined, undefined, true)).toBe("connected");
  });

  it("does not flash the banner when controlState arrives before connected", () => {
    // Cold-start order can land controlState=0 before comm.connected. Until
    // `connected` has been confirmed true we have no business asserting a
    // blackout or partial-control state.
    expect(deriveState(undefined, 0, false)).toBe("connected");
    expect(deriveState(undefined, 1, false)).toBe("connected");
    expect(deriveState(undefined, 2, false)).toBe("connected");
  });

  it("reports connected when comm.connected is true and controlState is full", () => {
    expect(deriveState(true, 2, true)).toBe("connected");
  });

  it("does NOT report lost on a cold-start false (hasConfirmedConnection = false)", () => {
    // Mirrors BufferedDataSource's gate: a user whose KSP reports false
    // without ever asserting true (CommNet off, no antenna, no vessel)
    // should see data flow AND a quiet banner, not a flashing blackout.
    expect(deriveState(false, 2, false)).toBe("connected");
    expect(deriveState(false, 1, false)).toBe("connected");
    expect(deriveState(false, 0, false)).toBe("connected");
    expect(deriveState(false, undefined, false)).toBe("connected");
  });

  it("reports lost when we've seen a confirmed link and it dropped", () => {
    expect(deriveState(false, 2, true)).toBe("lost");
    expect(deriveState(false, 0, true)).toBe("lost");
    expect(deriveState(false, undefined, true)).toBe("lost");
  });

  it("reports partial for reduced-control states while connected is confirmed true", () => {
    expect(deriveState(true, 1, true)).toBe("partial");
    expect(deriveState(true, 0, true)).toBe("partial");
  });
});
