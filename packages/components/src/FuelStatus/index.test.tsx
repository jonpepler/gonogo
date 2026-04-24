import type { DataKey } from "@gonogo/core";
import {
  clearRegistry,
  MockDataSource,
  registerDataSource,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FuelStatusComponent } from "./index";

const FUEL_KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "v.currentStage" },
  { key: "dv.stageCount" },
  { key: "dv.stages" },
  { key: "r.resource[LiquidFuel]" },
  { key: "r.resourceMax[LiquidFuel]" },
  { key: "r.resourceCurrent[LiquidFuel]" },
  { key: "r.resourceCurrentMax[LiquidFuel]" },
  { key: "r.resource[Oxidizer]" },
  { key: "r.resourceMax[Oxidizer]" },
  { key: "r.resourceCurrent[Oxidizer]" },
  { key: "r.resourceCurrentMax[Oxidizer]" },
  { key: "r.resource[MonoPropellant]" },
  { key: "r.resourceMax[MonoPropellant]" },
  { key: "r.resourceCurrent[MonoPropellant]" },
  { key: "r.resourceCurrentMax[MonoPropellant]" },
  { key: "r.resource[XenonGas]" },
  { key: "r.resourceMax[XenonGas]" },
  { key: "r.resourceCurrent[XenonGas]" },
  { key: "r.resourceCurrentMax[XenonGas]" },
  { key: "r.resource[ElectricCharge]" },
  { key: "r.resourceMax[ElectricCharge]" },
  { key: "r.resourceCurrent[ElectricCharge]" },
  { key: "r.resourceCurrentMax[ElectricCharge]" },
];

function makeStage(stage: number, fuelMass: number): Record<string, number> {
  // Minimal stage fixture — only fuelMass is exercised by the widget; other
  // fields present-and-zero so the shape matches what Telemachus emits.
  return {
    stage,
    fuelMass,
    stageMass: fuelMass,
    dryMass: 0,
    startMass: fuelMass,
    endMass: 0,
    burnTime: 0,
    deltaVVac: 0,
    deltaVASL: 0,
    deltaVActual: 0,
    TWRVac: 0,
    TWRASL: 0,
    TWRActual: 0,
    ispVac: 0,
    ispASL: 0,
    ispActual: 0,
    thrustVac: 0,
    thrustASL: 0,
    thrustActual: 0,
  };
}

describe("FuelStatusComponent", () => {
  let source: MockDataSource;
  let buffered: BufferedDataSource;

  beforeEach(async () => {
    clearRegistry();
    source = new MockDataSource({ keys: FUEL_KEYS });
    buffered = new BufferedDataSource({ source, store: new MemoryStore() });
    registerDataSource(buffered);
    await buffered.connect();
  });

  afterEach(() => {
    buffered.disconnect();
  });

  function primeFlight(): void {
    // FlightDetector gates sample persistence on name + missionTime arriving;
    // emit them first so useDataValue replays the later emits to subscribers.
    source.emit("v.name", "Kerbal X");
    source.emit("v.missionTime", 0);
  }

  it("renders a bar for each resource with a non-zero max", () => {
    const { container, queryByText } = render(
      <FuelStatusComponent config={{}} id="fuel-test" />,
    );

    act(() => {
      primeFlight();
      // Only LF + Ox are present on this vessel; RCS and friends stay at 0.
      source.emit("r.resourceCurrent[LiquidFuel]", 600);
      source.emit("r.resourceCurrentMax[LiquidFuel]", 1200);
      source.emit("r.resourceCurrent[Oxidizer]", 1000);
      source.emit("r.resourceCurrentMax[Oxidizer]", 1467);
    });

    expect(queryByText("Liquid Fuel")).not.toBeNull();
    expect(queryByText("Oxidizer")).not.toBeNull();
    // RCS / Xenon / Power all have max=0 → rows hidden.
    expect(queryByText("RCS")).toBeNull();
    expect(queryByText("Xenon")).toBeNull();
    expect(queryByText("Power")).toBeNull();

    // 600/1200 on LF → 50% fill (width: 50%). Look for the BarFill inline style.
    const fills = Array.from(
      container.querySelectorAll("div[style*='width']"),
    ).map((el) => (el as HTMLElement).style.width);
    expect(fills).toContain("50%");
  });

  it("shows RCS (vessel-wide) whenever monoprop max > 0, even with empty stage slot", () => {
    const { queryByText } = render(
      <FuelStatusComponent config={{}} id="fuel-test" />,
    );

    act(() => {
      primeFlight();
      // Stage has no monoprop, but the vessel carries a full RCS tank up top.
      source.emit("r.resource[MonoPropellant]", 120);
      source.emit("r.resourceMax[MonoPropellant]", 120);
      source.emit("r.resourceCurrent[MonoPropellant]", 0);
      source.emit("r.resourceCurrentMax[MonoPropellant]", 0);
    });

    expect(queryByText("RCS")).not.toBeNull();
  });

  it("renders the stage stack with the current stage highlighted", () => {
    const { container } = render(
      <FuelStatusComponent config={{}} id="fuel-test" />,
    );

    act(() => {
      primeFlight();
      source.emit("v.currentStage", 1);
      source.emit("dv.stageCount", 3);
      // Telemachus emits stages high → low (current-top-of-stack first).
      source.emit("dv.stages", [
        makeStage(2, 8000),
        makeStage(1, 4400),
        makeStage(0, 1200),
      ]);
    });

    // StageLabel spans render as leaf elements with text content like
    // "  Stage 0" (inactive) or "▶ Stage 1" (active).
    const stageTexts = Array.from(container.querySelectorAll("span"))
      .map((el) => el.textContent ?? "")
      .filter((t) => /^[▶ ] Stage \d$/.test(t));
    expect(stageTexts).toEqual(["  Stage 2", "▶ Stage 1", "  Stage 0"]);
  });
});
