import type { DataKey } from "@gonogo/core";
import {
  clearActionHandlers,
  clearRegistry,
  DashboardItemContext,
  MockDataSource,
  registerDataSource,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrbitViewComponent } from "./index";

const KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "v.body" },
  { key: "comm.connected" },
  { key: "o.sma" },
  { key: "o.eccentricity" },
  { key: "o.trueAnomaly" },
  { key: "o.argumentOfPeriapsis" },
  { key: "o.ApR" },
  { key: "o.PeR" },
  { key: "o.ApA" },
  { key: "o.PeA" },
];

describe("OrbitViewComponent", () => {
  let source: MockDataSource;
  let buffered: BufferedDataSource;

  beforeEach(async () => {
    clearRegistry();
    source = new MockDataSource({ keys: KEYS, affectedBySignalLoss: true });
    buffered = new BufferedDataSource({ source, store: new MemoryStore() });
    registerDataSource(buffered);
    await buffered.connect();
  });

  afterEach(() => {
    cleanup();
    buffered.disconnect();
    clearActionHandlers();
  });

  function renderView(
    config: Parameters<typeof OrbitViewComponent>[0]["config"] = {},
  ) {
    return render(
      <DashboardItemContext.Provider value={{ instanceId: "orbit-view" }}>
        <OrbitViewComponent config={config} id="orbit-view" />
      </DashboardItemContext.Provider>,
    );
  }

  it("shows the 'No orbital data' fallback before telemetry arrives", () => {
    const { container } = renderView();
    expect(container.textContent).toContain("No orbital data");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renders the SVG diagram once orbital state lands", () => {
    const { container } = renderView();

    act(() => {
      source.emit("comm.connected", true);
      source.emit("v.name", "Test Vessel");
      source.emit("v.missionTime", 0);
      source.emit("v.body", "Kerbin");
      source.emit("o.sma", 681500);
      source.emit("o.eccentricity", 0.005);
      source.emit("o.trueAnomaly", 0);
      source.emit("o.argumentOfPeriapsis", 0);
      source.emit("o.ApR", 685000);
      source.emit("o.PeR", 678000);
      source.emit("o.ApA", 85000);
      source.emit("o.PeA", 78000);
    });

    expect(container.textContent).not.toContain("No orbital data");
    expect(container.querySelector("svg")).not.toBeNull();
    // Subtitle shows the body name.
    expect(container.textContent).toContain("Kerbin");
  });
});
