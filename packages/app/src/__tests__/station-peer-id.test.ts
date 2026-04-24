import { describe, expect, it } from "vitest";
import { clearStationPeerId, getStationPeerId } from "../peer/stationPeerId";

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

describe("stationPeerId", () => {
  it("generates and persists a stable id on first call", () => {
    const storage = makeStorage();
    const first = getStationPeerId(storage);
    expect(first).toMatch(/^station-/);

    // Same storage → same id. Survives a simulated page refresh.
    const second = getStationPeerId(storage);
    expect(second).toBe(first);
  });

  it("regenerates after clear", () => {
    const storage = makeStorage();
    const first = getStationPeerId(storage);
    clearStationPeerId(storage);
    const second = getStationPeerId(storage);
    expect(second).not.toBe(first);
    expect(second).toMatch(/^station-/);
  });

  it("accepts an externally-written id", () => {
    const storage = makeStorage();
    storage.setItem("gonogo.station.peer-id", "station-fixed-abc");
    expect(getStationPeerId(storage)).toBe("station-fixed-abc");
  });
});
