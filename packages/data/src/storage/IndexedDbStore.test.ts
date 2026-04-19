import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FlightRecord } from "../types";
import { IndexedDbStore } from "./IndexedDbStore";

// fake-indexeddb is installed via setupFiles (src/test/setup.ts). Each test
// uses a fresh database name so state doesn't leak between tests.

let dbCounter = 0;

function freshStore(): IndexedDbStore {
  dbCounter += 1;
  return new IndexedDbStore({
    dbName: `gonogo-test-${dbCounter}`,
    flushIntervalMs: 10,
  });
}

function flight(overrides: Partial<FlightRecord> = {}): FlightRecord {
  return {
    id: "f1",
    vesselName: "Kerbal X",
    launchedAt: 1000,
    lastSampleAt: 1000,
    lastMissionTime: 0,
    sampleCount: 0,
    ...overrides,
  };
}

describe("IndexedDbStore", () => {
  let store: IndexedDbStore;

  beforeEach(() => {
    store = freshStore();
  });

  afterEach(async () => {
    await store.flush();
  });

  it("round-trips a flight", async () => {
    await store.upsertFlight(flight());
    const got = await store.getFlight("f1");
    expect(got?.vesselName).toBe("Kerbal X");
  });

  it("lists flights sorted by launchedAt descending", async () => {
    await store.upsertFlight(flight({ id: "old", launchedAt: 1000 }));
    await store.upsertFlight(flight({ id: "new", launchedAt: 2000 }));
    const list = await store.listFlights();
    expect(list.map((f) => f.id)).toEqual(["new", "old"]);
  });

  it("persists + queries samples in timestamp order", async () => {
    await store.appendSample("f1", "v.altitude", 100, 10);
    await store.appendSample("f1", "v.altitude", 200, 20);
    await store.appendSample("f1", "v.altitude", 300, 30);
    const range = await store.queryRange("f1", "v.altitude", 0, 500);
    expect(range.t).toEqual([100, 200, 300]);
    expect(range.v).toEqual([10, 20, 30]);
  });

  it("applies inclusive bounds on queryRange", async () => {
    for (let t = 100; t <= 500; t += 100) {
      await store.appendSample("f1", "k", t, t);
    }
    const range = await store.queryRange("f1", "k", 200, 400);
    expect(range.t).toEqual([200, 300, 400]);
  });

  it("isolates samples per (flight, key)", async () => {
    await store.appendSample("f1", "a", 1, "fa");
    await store.appendSample("f1", "b", 1, "fb");
    await store.appendSample("f2", "a", 1, "ga");

    const f1a = await store.queryRange("f1", "a", 0, 10);
    const f1b = await store.queryRange("f1", "b", 0, 10);
    const f2a = await store.queryRange("f2", "a", 0, 10);

    expect(f1a.v).toEqual(["fa"]);
    expect(f1b.v).toEqual(["fb"]);
    expect(f2a.v).toEqual(["ga"]);
  });

  it("deleteFlight cascades to samples", async () => {
    await store.upsertFlight(flight({ id: "f1" }));
    await store.upsertFlight(flight({ id: "f2" }));
    await store.appendSample("f1", "k", 1, "a");
    await store.appendSample("f1", "k", 2, "b");
    await store.appendSample("f2", "k", 1, "z");

    await store.deleteFlight("f1");

    expect(await store.getFlight("f1")).toBeNull();
    expect(await store.getFlight("f2")).not.toBeNull();
    expect((await store.queryRange("f1", "k", 0, 10)).v).toEqual([]);
    expect((await store.queryRange("f2", "k", 0, 10)).v).toEqual(["z"]);
  });

  it("clearAllFlights empties both stores", async () => {
    await store.upsertFlight(flight());
    await store.appendSample("f1", "k", 1, "a");

    await store.clearAllFlights();

    expect(await store.listFlights()).toEqual([]);
    expect((await store.queryRange("f1", "k", 0, 10)).v).toEqual([]);
  });

  it("batches writes but flushes before queryRange", async () => {
    // Rapid-fire appends should all be observable by the next query.
    for (let i = 0; i < 100; i++) {
      await store.appendSample("f1", "k", i, i * 10);
    }
    const range = await store.queryRange("f1", "k", 0, 99);
    expect(range.t).toHaveLength(100);
    expect(range.v[0]).toBe(0);
    expect(range.v[99]).toBe(990);
  });

  it("persists samples across store instances with the same dbName", async () => {
    const dbName = `gonogo-persist-${dbCounter++}`;
    const first = new IndexedDbStore({ dbName, flushIntervalMs: 10 });
    await first.appendSample("f1", "k", 1, "persisted");
    await first.flush();

    const second = new IndexedDbStore({ dbName, flushIntervalMs: 10 });
    const range = await second.queryRange("f1", "k", 0, 10);
    expect(range.v).toEqual(["persisted"]);
  });
});
