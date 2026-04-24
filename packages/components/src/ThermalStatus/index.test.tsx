import type { DataKey } from "@gonogo/core";
import {
  clearRegistry,
  MockDataSource,
  registerDataSource,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThermalStatusComponent } from "./index";

const KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "therm.hottestPartName" },
  { key: "therm.hottestPartTemp" },
  { key: "therm.hottestPartMaxTemp" },
  { key: "therm.hottestPartTempRatio" },
  { key: "therm.hottestEngineTemp" },
  { key: "therm.hottestEngineMaxTemp" },
  { key: "therm.hottestEngineTempRatio" },
  { key: "therm.anyEnginesOverheating" },
  { key: "therm.heatShieldTempCelsius" },
  { key: "therm.heatShieldFlux" },
];

function primeFlight(source: MockDataSource): void {
  source.emit("v.name", "Test Vessel");
  source.emit("v.missionTime", 0);
}

describe("ThermalStatusComponent", () => {
  let source: MockDataSource;
  let buffered: BufferedDataSource;

  beforeEach(async () => {
    clearRegistry();
    source = new MockDataSource({ keys: KEYS });
    buffered = new BufferedDataSource({ source, store: new MemoryStore() });
    registerDataSource(buffered);
    await buffered.connect();
  });

  afterEach(() => {
    cleanup();
    buffered.disconnect();
  });

  it("shows the no-data placeholder until telemetry arrives", () => {
    render(<ThermalStatusComponent config={{}} id="therm" />);
    expect(screen.getByText("No thermal data")).toBeInTheDocument();
  });

  it("renders hottest-part + hottest-engine readouts when telemetry arrives", () => {
    render(<ThermalStatusComponent config={{}} id="therm" />);
    act(() => {
      primeFlight(source);
      source.emit("therm.hottestPartName", "LV-T30 'Reliant'");
      source.emit("therm.hottestPartTemp", 640); // °C
      source.emit("therm.hottestPartMaxTemp", 2273); // K (≈2000°C)
      source.emit("therm.hottestPartTempRatio", 0.33);
      source.emit("therm.hottestEngineTemp", 913); // K (≈640°C)
      source.emit("therm.hottestEngineMaxTemp", 2273);
      source.emit("therm.hottestEngineTempRatio", 0.4);
      source.emit("therm.anyEnginesOverheating", false);
    });

    expect(screen.getByText("LV-T30 'Reliant'")).toBeInTheDocument();
    expect(screen.getByText("Hottest part")).toBeInTheDocument();
    expect(screen.getByText("Hottest engine")).toBeInTheDocument();
    // Nominal bands at 33% / 40% — no role=alert banner.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("raises a role=alert banner when any engine is flagged overheating", () => {
    render(<ThermalStatusComponent config={{}} id="therm" />);
    act(() => {
      primeFlight(source);
      source.emit("therm.hottestEngineTemp", 2150);
      source.emit("therm.hottestEngineMaxTemp", 2273);
      source.emit("therm.hottestEngineTempRatio", 0.945);
      source.emit("therm.anyEnginesOverheating", true);
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/engine overheating/i);
  });

  it("raises a role=alert banner when the hottest part ratio is critical", () => {
    render(<ThermalStatusComponent config={{}} id="therm" />);
    act(() => {
      primeFlight(source);
      source.emit("therm.hottestPartName", "Heat Shield (2.5m)");
      source.emit("therm.hottestPartTemp", 2150);
      source.emit("therm.hottestPartMaxTemp", 2500);
      source.emit("therm.hottestPartTempRatio", 0.99);
      source.emit("therm.anyEnginesOverheating", false);
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/approaching max temperature/i);
  });
});
