import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferedDataSource } from "./BufferedDataSource";
import { MemoryStore } from "./storage/MemoryStore";

/**
 * Minimal in-memory data source for tests. Lets us drive arbitrary samples
 * without MSW/WS setup.
 */
class MockSource implements DataSource {
  readonly id = "mock";
  readonly name = "Mock";
  status: DataSourceStatus = "disconnected";

  private readonly subs = new Map<string, Set<(v: unknown) => void>>();
  private readonly statusSubs = new Set<(s: DataSourceStatus) => void>();
  private readonly keys: DataKey[];

  constructor(keys: DataKey[]) {
    this.keys = keys;
  }

  async connect(): Promise<void> {
    this.status = "connected";
    this.statusSubs.forEach((cb) => {
      cb("connected");
    });
  }

  disconnect(): void {
    this.status = "disconnected";
    this.statusSubs.forEach((cb) => {
      cb("disconnected");
    });
  }

  schema(): DataKey[] {
    return this.keys;
  }

  subscribe(key: string, cb: (v: unknown) => void): () => void {
    let bucket = this.subs.get(key);
    if (!bucket) {
      bucket = new Set();
      this.subs.set(key, bucket);
    }
    bucket.add(cb);
    return () => {
      bucket?.delete(cb);
    };
  }

  onStatusChange(cb: (s: DataSourceStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => {
      this.statusSubs.delete(cb);
    };
  }

  async execute(_action: string): Promise<void> {}
  configSchema(): ConfigField[] {
    return [];
  }
  configure(_config: Record<string, unknown>): void {}
  getConfig(): Record<string, unknown> {
    return {};
  }

  // Test-side helper — drive a value to all subscribers of `key`.
  emit(key: string, value: unknown): void {
    this.subs.get(key)?.forEach((cb) => {
      cb(value);
    });
  }
}

const MOCK_KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "v.altitude" },
];

describe("BufferedDataSource", () => {
  let source: MockSource;
  let store: MemoryStore;
  let buffered: BufferedDataSource;
  let clock = 1000;

  beforeEach(async () => {
    source = new MockSource(MOCK_KEYS);
    store = new MemoryStore();
    clock = 1000;
    buffered = new BufferedDataSource({
      source,
      store,
      now: () => clock,
      inMemoryLimit: 10,
    });
    await buffered.connect();
  });

  afterEach(() => {
    buffered.disconnect();
  });

  it("passes through live values to subscribers", () => {
    const spy = vi.fn();
    buffered.subscribe("v.altitude", spy);
    source.emit("v.altitude", 12_345);
    expect(spy).toHaveBeenCalledWith(12_345);
  });

  it("persists samples once a flight has been identified", async () => {
    source.emit("v.name", "Kerbal X");
    source.emit("v.missionTime", 0);
    clock = 2000;
    source.emit("v.altitude", 100);

    const flight = buffered.getCurrentFlight();
    expect(flight).not.toBeNull();
    const range = await buffered.queryRange("v.altitude", 0, 10_000);
    expect(range.v).toEqual([100]);
    expect(range.t).toEqual([2000]);
  });

  it("drops samples that arrive before v.name + v.missionTime", async () => {
    source.emit("v.altitude", 999); // pre-flight, should be dropped
    source.emit("v.name", "Kerbal X");
    source.emit("v.missionTime", 0);
    source.emit("v.altitude", 100);

    const range = await buffered.queryRange("v.altitude", 0, 10_000);
    expect(range.v).toEqual([100]);
  });

  it("mints a new flight on mission-time revert", async () => {
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 100);
    const first = buffered.getCurrentFlight();

    clock = 2000;
    source.emit("v.missionTime", 5);
    const second = buffered.getCurrentFlight();

    expect(second?.id).not.toBe(first?.id);
    const flights = await buffered.listFlights();
    expect(flights).toHaveLength(2);
  });

  it("emits onFlightChange when the flight transitions", () => {
    const spy = vi.fn();
    buffered.onFlightChange(spy);

    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
    expect(spy).toHaveBeenCalledTimes(1);

    // Another sample in the same flight — no transition.
    source.emit("v.missionTime", 1);
    expect(spy).toHaveBeenCalledTimes(1);

    // Revert → new flight.
    source.emit("v.missionTime", -10);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("getLatest returns in-memory ring buffer", () => {
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
    for (let i = 0; i < 5; i++) {
      clock += 100;
      source.emit("v.altitude", i);
    }
    const latest = buffered.getLatest("v.altitude");
    expect(latest.v).toEqual([0, 1, 2, 3, 4]);
  });

  it("trims in-memory buffer at the configured limit", () => {
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
    for (let i = 0; i < 25; i++) {
      clock += 100;
      source.emit("v.altitude", i);
    }
    const latest = buffered.getLatest("v.altitude");
    expect(latest.v).toHaveLength(10);
    expect(latest.v[0]).toBe(15);
    expect(latest.v[9]).toBe(24);
  });

  it("deleteFlight removes the flight and its samples", async () => {
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
    source.emit("v.altitude", 42);
    const id = buffered.getCurrentFlight()?.id;
    expect(id).toBeDefined();

    await buffered.deleteFlight(id ?? "missing");
    expect(buffered.getCurrentFlight()).toBeNull();
    expect(await buffered.listFlights()).toEqual([]);
  });

  it("clearAllFlights wipes storage and in-memory buffer", async () => {
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
    source.emit("v.altitude", 42);

    await buffered.clearAllFlights();

    expect(buffered.getCurrentFlight()).toBeNull();
    expect(await buffered.listFlights()).toEqual([]);
    expect(buffered.getLatest("v.altitude").v).toEqual([]);
  });

  it("hydrates the detector from the store on connect (resume across reloads)", async () => {
    // Simulate a previously-persisted flight.
    await store.upsertFlight({
      id: "seed-1",
      vesselName: "KX",
      vesselUid: null,
      launchedAt: 0,
      lastSampleAt: 500,
      lastMissionTime: 50,
      sampleCount: 5,
    });
    buffered.disconnect();

    const fresh = new BufferedDataSource({
      source,
      store,
      now: () => 1_000,
      inMemoryLimit: 10,
    });
    await fresh.connect();

    source.emit("v.name", "KX");
    source.emit("v.missionTime", 51);

    expect(fresh.getCurrentFlight()?.id).toBe("seed-1");
    fresh.disconnect();
  });

  it("proxies status changes from the wrapped source", () => {
    const spy = vi.fn();
    buffered.onStatusChange(spy);
    source.disconnect();
    expect(spy).toHaveBeenCalledWith("disconnected");
  });
});
