import { describe, expect, it } from "vitest";
import { deriveState } from "./SignalLossIndicator";

describe("SignalLossIndicator — deriveState", () => {
  it("treats absent telemetry as connected (warmup hides the banner)", () => {
    expect(deriveState(undefined, undefined)).toBe("connected");
  });

  it("reports connected when comm.connected is true and controlState is full", () => {
    expect(deriveState(true, 2)).toBe("connected");
  });

  it("reports lost whenever comm.connected is false — same condition as the gate", () => {
    expect(deriveState(false, 2)).toBe("lost");
    expect(deriveState(false, 1)).toBe("lost");
    expect(deriveState(false, 0)).toBe("lost");
    expect(deriveState(false, undefined)).toBe("lost");
  });

  it("reports partial for reduced-control states while still connected", () => {
    // controlState 1 = partial control (probe with signal but no crew pilot)
    expect(deriveState(true, 1)).toBe("partial");
    // controlState 0 while somehow still connected — rare but possible;
    // keep data flowing (gate doesn't fire), show an amber warning.
    expect(deriveState(true, 0)).toBe("partial");
  });
});
