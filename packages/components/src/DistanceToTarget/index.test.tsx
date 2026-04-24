import type { DataKey } from "@gonogo/core";
import {
  clearRegistry,
  MockDataSource,
  registerDataSource,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DistanceToTargetComponent } from "./index";

const KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "comm.connected" },
  { key: "tar.name" },
  { key: "tar.distance" },
];

describe("DistanceToTargetComponent", () => {
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
  });

  it("shows a 'no target set' hint until tar.name is reported", () => {
    const { container } = render(<DistanceToTargetComponent />);
    expect(container.textContent).toContain("No target set in KSP");
  });

  it("shows an em-dash once a target name is known but distance is unknown", () => {
    const { container } = render(<DistanceToTargetComponent />);
    act(() => {
      source.emit("comm.connected", true);
      source.emit("v.name", "Test");
      source.emit("v.missionTime", 0);
      source.emit("tar.name", "Mun");
    });
    expect(container.textContent).not.toContain("No target set in KSP");
    expect(container.textContent).toContain("Mun");
    // Distance placeholder is an em-dash.
    expect(container.textContent).toContain("—");
  });

  it("renders a human-formatted distance when both name and distance arrive", () => {
    const { container } = render(<DistanceToTargetComponent />);
    act(() => {
      source.emit("comm.connected", true);
      source.emit("v.name", "Test");
      source.emit("v.missionTime", 0);
      source.emit("tar.name", "Minmus");
      // 47 million meters — formatDistance should output a km/Mm-scaled value.
      source.emit("tar.distance", 47_000_000);
    });
    expect(container.textContent).toContain("Minmus");
    // 47 Mm is comfortably above km; expect some number followed by a unit.
    expect(container.textContent).toMatch(/\d[\d.]*\s*(k?m|Mm)/);
  });
});
