import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BufferedDataSource } from "./BufferedDataSource";
import { clearDerivedKeys, registerDerivedKey } from "./derive";
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

  it("schema() enriches raw keys with metadata", () => {
    const schema = buffered.schema();
    const alt = schema.find((k) => k.key === "v.altitude");
    expect(alt?.label).toBe("Altitude");
    expect(alt?.unit).toBe("m");
    expect(alt?.group).toBe("Position");
  });

  it("schema() falls back to key-as-label for keys absent from telemachusMeta", () => {
    // Use a mock source that includes a key with no metadata entry.
    const unknownSource = new MockSource([
      { key: "v.name" },
      { key: "v.missionTime" },
      { key: "totally.unknown.key" },
    ]);
    const buf = new BufferedDataSource({ source: unknownSource, store: new MemoryStore(), now: () => clock });
    // connect() is not needed — schema() is synchronous
    const schema = buf.schema();
    const unknown = schema.find((k) => k.key === "totally.unknown.key");
    expect(unknown?.label).toBe("totally.unknown.key");
    expect(unknown?.group).toBe("Other");
  });
});

describe("BufferedDataSource — derived keys", () => {
  let source: MockSource;
  let store: MemoryStore;
  let buffered: BufferedDataSource;
  let clock = 1000;

  const KEYS_WITH_ALTITUDE: DataKey[] = [
    { key: "v.name" },
    { key: "v.missionTime" },
    { key: "v.altitude" },
  ];

  beforeEach(async () => {
    clearDerivedKeys();
    source = new MockSource(KEYS_WITH_ALTITUDE);
    store = new MemoryStore();
    clock = 1000;
    buffered = new BufferedDataSource({
      source,
      store,
      now: () => clock,
      inMemoryLimit: 50,
    });
    await buffered.connect();
    // Establish a flight
    source.emit("v.name", "KX");
    source.emit("v.missionTime", 0);
  });

  afterEach(() => {
    buffered.disconnect();
    clearDerivedKeys();
  });

  it("emits derived value to subscribe() subscribers", () => {
    registerDerivedKey({
      id: "test.double",
      inputs: ["v.altitude"],
      meta: { label: "Doubled altitude", group: "Test" },
      fn: ([alt]) => (alt.v as number) * 2,
    });

    const spy = vi.fn();
    buffered.subscribe("test.double", spy);

    source.emit("v.altitude", 500);
    expect(spy).toHaveBeenCalledWith(1000);
  });

  it("emits derived value to subscribeSamples() subscribers", () => {
    registerDerivedKey({
      id: "test.double",
      inputs: ["v.altitude"],
      meta: { label: "Doubled altitude", group: "Test" },
      fn: ([alt]) => (alt.v as number) * 2,
    });

    const spy = vi.fn();
    buffered.subscribeSamples("test.double", spy);

    clock = 2000;
    source.emit("v.altitude", 500);
    expect(spy).toHaveBeenCalledWith({ t: 2000, v: 1000 });
  });

  it("does not emit derived value until all inputs have been seen", () => {
    registerDerivedKey({
      id: "test.sum",
      inputs: ["v.altitude", "v.missionTime"],
      meta: { label: "Sum", group: "Test" },
      fn: ([alt, mt]) => (alt.v as number) + (mt.v as number),
    });

    const spy = vi.fn();
    buffered.subscribe("test.sum", spy);

    // missionTime arrived in beforeEach, but altitude has not yet
    source.emit("v.altitude", 100);
    expect(spy).toHaveBeenCalledTimes(1); // fires now — both inputs seen
  });

  it("does not emit derived value when fn returns undefined", () => {
    registerDerivedKey({
      id: "test.noFirst",
      inputs: ["v.altitude"],
      meta: { label: "No first", group: "Test" },
      fn: (_inputs, previous) => (previous === null ? undefined : 42),
    });

    const spy = vi.fn();
    buffered.subscribe("test.noFirst", spy);

    source.emit("v.altitude", 100); // first — fn returns undefined
    expect(spy).not.toHaveBeenCalled();

    source.emit("v.altitude", 200); // second — fn returns 42
    expect(spy).toHaveBeenCalledWith(42);
  });

  it("persists derived samples to the store", async () => {
    registerDerivedKey({
      id: "test.double",
      inputs: ["v.altitude"],
      meta: { label: "Doubled altitude", group: "Test" },
      fn: ([alt]) => (alt.v as number) * 2,
    });

    clock = 3000;
    source.emit("v.altitude", 100);

    const range = await buffered.queryRange("test.double", 0, 99_999);
    expect(range.v).toEqual([200]);
  });

  it("schema() includes registered derived keys", () => {
    registerDerivedKey({
      id: "test.double",
      inputs: ["v.altitude"],
      meta: { label: "Doubled altitude", unit: "m", group: "Test" },
      fn: ([alt]) => (alt.v as number) * 2,
    });

    const schema = buffered.schema();
    const derived = schema.find((k) => k.key === "test.double");
    expect(derived?.label).toBe("Doubled altitude");
    expect(derived?.unit).toBe("m");
    expect(derived?.group).toBe("Test");
  });

  it("resets derivedPrevious on flight transition so rate does not straddle flights", () => {
    registerDerivedKey({
      id: "test.rate",
      inputs: ["v.altitude"],
      meta: { label: "Rate", group: "Test" },
      fn: ([alt], previous) => {
        if (previous === null) return undefined;
        const dt = (alt.t - previous[0].t) / 1000;
        return ((alt.v as number) - (previous[0].v as number)) / dt;
      },
    });

    const spy = vi.fn();
    buffered.subscribe("test.rate", spy);

    clock = 1000;
    source.emit("v.altitude", 100); // first — no previous, no emit
    clock = 2000;
    source.emit("v.altitude", 200); // 100 m/s
    expect(spy).toHaveBeenCalledWith(100);

    spy.mockClear();

    // Trigger a new flight via missionTime revert
    source.emit("v.missionTime", -10);
    // First altitude after flight change — previous is cleared, so no rate
    clock = 3000;
    source.emit("v.altitude", 50);
    expect(spy).not.toHaveBeenCalled();
  });

  it("clearAllFlights resets derivation state", async () => {
    registerDerivedKey({
      id: "test.rate",
      inputs: ["v.altitude"],
      meta: { label: "Rate", group: "Test" },
      fn: ([alt], previous) => (previous === null ? undefined : (alt.v as number) - (previous[0].v as number)),
    });

    source.emit("v.altitude", 100); // seeds lastRawSample + derivedPrevious

    await buffered.clearAllFlights(); // clears derivedPrevious synchronously before returns

    const spy = vi.fn();
    buffered.subscribe("test.rate", spy);
    source.emit("v.altitude", 50); // after clear — previous is null, no emit
    expect(spy).not.toHaveBeenCalled();
  });
});
