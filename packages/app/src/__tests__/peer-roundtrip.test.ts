/**
 * End-to-end integration test for the host → station telemetry path.
 *
 * Wires:
 *   MockTelemachus
 *   → BufferedDataSource (real, incl. signal-loss gate + flight detection)
 *   → PeerBroadcastingDataSource (real)
 *   → in-memory relay (stand-in for PeerJS data channel)
 *   → PeerClientDataSource (real)
 *   → subscriber
 *
 * The PeerHostService / PeerClientService layers are bypassed — the relay
 * function plays the role of the peer transport. That keeps the test free of
 * PeerJS mocking while still exercising every data-shape + filter boundary
 * that the reported station bug crossed.
 *
 * Designed to fail if:
 *   - BufferedDataSource gates samples on a cold-start `comm.connected: false`
 *   - PBDS stops forwarding subscribeSamples
 *   - PCDS mis-routes messages based on sourceId
 *   - A value arrives at the subscriber with a different type than was emitted
 */

import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerBroadcastingDataSource } from "../peer/PeerBroadcastingDataSource";
import { PeerClientDataSource } from "../peer/PeerClientDataSource";
import type { PeerMessage } from "../peer/protocol";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** Minimal Telemachus-shaped fake — subscribe + emit, nothing else. */
class MockTelemachus implements DataSource {
  readonly id = "telemachus";
  readonly name = "Mock Telemachus";
  status: DataSourceStatus = "disconnected";
  // Matches the real TelemachusDataSource so BufferedDataSource's signal-loss
  // gate logic is exercised end-to-end.
  affectedBySignalLoss = true;

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

  async execute(): Promise<void> {}
  configSchema(): ConfigField[] {
    return [];
  }
  configure(): void {}
  getConfig(): Record<string, unknown> {
    return {};
  }

  /** Test helper — drive a value to all live subscribers for `key`. */
  emit(key: string, value: unknown): void {
    this.subs.get(key)?.forEach((cb) => {
      cb(value);
    });
  }
}

/** Fake PeerHostService — captures broadcasts for the relay to forward. */
function makeFakeHost() {
  let bridge: ((msg: PeerMessage) => void) | null = null;
  return {
    broadcast: vi.fn((msg: PeerMessage) => {
      bridge?.(msg);
    }),
    /** Connect the host's output to a consumer (the fake client). */
    bridgeTo(fn: (msg: PeerMessage) => void): void {
      bridge = fn;
    },
  };
}

/**
 * Fake PeerClientService exposing just the hooks PCDS consumes. The relay
 * connects this fake to the fake host so every broadcast becomes an
 * `onData` / `onSourceStatus` fire on the client side.
 */
function makeFakeClient() {
  const dataListeners = new Set<
    (sourceId: string, key: string, value: unknown, t: number) => void
  >();
  const statusListeners = new Set<(sourceId: string, status: string) => void>();
  return {
    onData(
      cb: (sourceId: string, key: string, value: unknown, t: number) => void,
    ) {
      dataListeners.add(cb);
      return () => dataListeners.delete(cb);
    },
    onSourceStatus(cb: (sourceId: string, status: string) => void) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    onConnectionStatus: vi.fn().mockReturnValue(() => {}),
    onSchema: vi.fn().mockReturnValue(() => {}),
    sendExecute: vi.fn(),
    sendQueryRange: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    /** Relay entry-point: feed a host broadcast into the client. */
    receive(msg: PeerMessage): void {
      if (msg.type === "data") {
        dataListeners.forEach((cb) => {
          cb(msg.sourceId, msg.key, msg.value, msg.t ?? Date.now());
        });
      } else if (msg.type === "status") {
        statusListeners.forEach((cb) => {
          cb(msg.sourceId, msg.status);
        });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const TELEMACHUS_KEYS: DataKey[] = [
  { key: "v.name" },
  { key: "v.missionTime" },
  { key: "v.altitude" },
  { key: "comm.connected" },
];

function setup() {
  const telemachus = new MockTelemachus(TELEMACHUS_KEYS);
  const buffered = new BufferedDataSource({
    source: telemachus,
    store: new MemoryStore(),
  });
  const fakeHost = makeFakeHost();
  const fakeClient = makeFakeClient();
  fakeHost.bridgeTo((msg) => fakeClient.receive(msg));

  // PBDS subscribes to the buffered source during construction — after this
  // call, any subsequent BufferedDataSource sample fans out as a broadcast.
  new PeerBroadcastingDataSource(buffered, fakeHost as never);

  const stationSide = new PeerClientDataSource(
    "data",
    "Data (station)",
    fakeClient as never,
  );

  return { telemachus, buffered, fakeHost, fakeClient, stationSide };
}

/** Prime flight detection so BufferedDataSource fans out samples. */
function primeFlight(tm: MockTelemachus) {
  tm.emit("v.name", "Kerbal X");
  tm.emit("v.missionTime", 0);
}

describe("peer roundtrip: telemachus → buffered → PBDS → relay → PCDS", () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(async () => {
    ctx = setup();
    await ctx.buffered.connect();
  });

  afterEach(() => {
    ctx.buffered.disconnect();
  });

  it("delivers a live telemachus sample all the way to a station subscriber", () => {
    const received: unknown[] = [];
    ctx.stationSide.subscribe("v.altitude", (v) => received.push(v));

    primeFlight(ctx.telemachus);
    ctx.telemachus.emit("v.altitude", 12_345);

    expect(received).toEqual([12_345]);
  });

  it("keeps flowing when comm.connected arrives false COLD (the station-widget regression)", () => {
    const received: unknown[] = [];
    ctx.stationSide.subscribe("v.altitude", (v) => received.push(v));

    // Simulate Telemachus on a vessel with no antenna / CommNet off:
    // comm.connected arrives false before the gate has ever confirmed a link.
    primeFlight(ctx.telemachus);
    ctx.telemachus.emit("comm.connected", false);
    ctx.telemachus.emit("v.altitude", 500);
    ctx.telemachus.emit("v.altitude", 600);

    // Gate must not engage — widgets must keep receiving values.
    expect(received).toEqual([500, 600]);
  });

  it("gates samples after a confirmed true → false transition and resumes on true", () => {
    const received: unknown[] = [];
    ctx.stationSide.subscribe("v.altitude", (v) => received.push(v));

    primeFlight(ctx.telemachus);
    ctx.telemachus.emit("comm.connected", true); // confirm link
    ctx.telemachus.emit("v.altitude", 100); // flows

    ctx.telemachus.emit("comm.connected", false); // blackout
    ctx.telemachus.emit("v.altitude", 999); // dropped at the gate

    ctx.telemachus.emit("comm.connected", true); // restore
    ctx.telemachus.emit("v.altitude", 200); // flows again

    expect(received).toEqual([100, 200]);
  });

  it("routes by sourceId — other-source broadcasts don't bleed into the station subscriber", () => {
    const received: unknown[] = [];
    ctx.stationSide.subscribe("v.altitude", (v) => received.push(v));

    // PCDS is pinned to id "data"; inject a message tagged with a foreign
    // sourceId and confirm it's ignored.
    ctx.fakeClient.receive({
      type: "data",
      sourceId: "some-other-source",
      key: "v.altitude",
      value: 42,
      t: Date.now(),
    });

    expect(received).toEqual([]);
  });

  it("propagates timestamped samples via subscribeSamples", () => {
    const received: Array<{ t: number; v: unknown }> = [];
    ctx.stationSide.subscribeSamples("v.altitude", (s) => received.push(s));

    primeFlight(ctx.telemachus);
    ctx.telemachus.emit("v.altitude", 777);

    expect(received).toHaveLength(1);
    expect(received[0].v).toBe(777);
    expect(typeof received[0].t).toBe("number");
  });
});
