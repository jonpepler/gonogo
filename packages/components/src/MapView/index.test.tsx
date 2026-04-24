import type { DataKey, OrbitPatch } from "@gonogo/core";
import {
  clearBodies,
  clearRegistry,
  DashboardItemContext,
  MockDataSource,
  registerDataSource,
  registerStockBodies,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapViewComponent } from "./index";

const MAPVIEW_KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "v.lat" },
  { key: "v.long" },
  { key: "v.body" },
  { key: "v.altitude" },
  { key: "v.dynamicPressure" },
  { key: "v.mach" },
  { key: "v.surfaceSpeed" },
  { key: "v.verticalSpeed" },
  { key: "o.orbitPatches" },
  { key: "o.maneuverNodes" },
  { key: "t.universalTime" },
  { key: "a.physicsMode" },
  { key: "land.predictedLat" },
  { key: "land.predictedLon" },
];

function kerbinCircularPatch(overrides: Partial<OrbitPatch> = {}): OrbitPatch {
  return {
    startUT: 0,
    endUT: 1_000_000,
    patchStartTransition: "INITIAL",
    patchEndTransition: "FINAL",
    PeA: 100_000,
    ApA: 100_000,
    inclination: 0,
    eccentricity: 0,
    epoch: 0,
    period: 2000,
    argumentOfPeriapsis: 0,
    sma: 700_000,
    lan: 0,
    maae: 0,
    referenceBody: "Kerbin",
    semiLatusRectum: 700_000,
    semiMinorAxis: 700_000,
    closestEncounterBody: null,
    ...overrides,
  };
}

describe("MapViewComponent", () => {
  let source: MockDataSource;
  let buffered: BufferedDataSource;

  beforeEach(async () => {
    clearRegistry();
    clearBodies();
    registerStockBodies();

    vi.stubGlobal(
      "ResizeObserver",
      class FakeResizeObserver {
        private cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe(_el: Element) {
          this.cb(
            [
              {
                contentRect: { width: 600, height: 300 },
              } as ResizeObserverEntry,
            ],
            this as unknown as ResizeObserver,
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );

    source = new MockDataSource({ keys: MAPVIEW_KEYS });
    buffered = new BufferedDataSource({ source, store: new MemoryStore() });
    registerDataSource(buffered);
    await buffered.connect();
  });

  afterEach(() => {
    cleanup();
    buffered.disconnect();
    vi.unstubAllGlobals();
    clearBodies();
  });

  function primeFlight(): void {
    source.emit("v.name", "Kerbal X");
    source.emit("v.missionTime", 0);
  }

  /** MapView reads DashboardItemContext via useActionInput — wrap in the provider. */
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <DashboardItemContext.Provider value={{ instanceId: "map-test" }}>
        {children}
      </DashboardItemContext.Provider>
    );
  }

  it("renders without crashing with no data", () => {
    const { container } = render(
      <Wrap>
        <MapViewComponent config={{}} id="map-test" />
      </Wrap>,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("renders the N-body chip when physicsMode is n_body", async () => {
    const { findByText } = render(
      <Wrap>
        <MapViewComponent config={{}} id="map-test" />
      </Wrap>,
    );
    act(() => {
      primeFlight();
      source.emit("v.lat", 0);
      source.emit("v.long", 0);
      source.emit("v.body", "Kerbin");
      source.emit("t.universalTime", 0);
      source.emit("o.orbitPatches", [kerbinCircularPatch()]);
      source.emit("a.physicsMode", "n_body");
    });
    const chip = await findByText(/Prediction unavailable/i);
    expect(chip).not.toBeNull();
  });

  it("does NOT render the N-body chip when showPrediction is false", () => {
    const { queryByText } = render(
      <Wrap>
        <MapViewComponent config={{ showPrediction: false }} id="map-test" />
      </Wrap>,
    );
    act(() => {
      primeFlight();
      source.emit("v.body", "Kerbin");
      source.emit("a.physicsMode", "n_body");
    });
    expect(queryByText(/Prediction unavailable/i)).toBeNull();
  });

  it("does NOT render the N-body chip on stock installs (patched_conics)", () => {
    const { queryByText } = render(
      <Wrap>
        <MapViewComponent config={{}} id="map-test" />
      </Wrap>,
    );
    act(() => {
      primeFlight();
      source.emit("v.body", "Kerbin");
      source.emit("a.physicsMode", "patched_conics");
    });
    expect(queryByText(/Prediction unavailable/i)).toBeNull();
  });

  it("renders without crashing with full prediction + impact data", () => {
    const { container } = render(
      <Wrap>
        <MapViewComponent config={{}} id="map-test" />
      </Wrap>,
    );
    act(() => {
      primeFlight();
      source.emit("v.lat", 12.5);
      source.emit("v.long", -70);
      source.emit("v.body", "Kerbin");
      source.emit("t.universalTime", 5_000);
      source.emit("o.orbitPatches", [kerbinCircularPatch()]);
      source.emit("o.maneuverNodes", []);
      source.emit("a.physicsMode", "patched_conics");
      source.emit("land.predictedLat", 13.2);
      source.emit("land.predictedLon", -69.5);
    });
    // 5 canvases: base, overlay, persistent-data, prediction, data.
    expect(container.querySelectorAll("canvas")).toHaveLength(5);
  });
});
