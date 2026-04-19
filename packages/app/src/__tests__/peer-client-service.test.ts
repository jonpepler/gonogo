import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted to the top of the file, so FakePeer / FakeDataConnection
// must be declared via vi.hoisted to be available when the factory runs.
const { FakePeer } = vi.hoisted(() => {
  class FakeDataConnection {
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    on(event: string, cb: (...args: unknown[]) => void) {
      const bucket = this.listeners.get(event) ?? [];
      bucket.push(cb);
      this.listeners.set(event, bucket);
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners.get(event)?.forEach((cb) => {
        cb(...args);
      });
    }

    close() {}
    send(_msg: unknown) {}
  }

  class FakePeer {
    static instances: FakePeer[] = [];
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>();

    _lastConn: FakeDataConnection | null = null;

    constructor() {
      FakePeer.instances.push(this);
    }

    on(event: string, cb: (...args: unknown[]) => void) {
      const bucket = this.listeners.get(event) ?? [];
      bucket.push(cb);
      this.listeners.set(event, bucket);
    }

    emit(event: string, ...args: unknown[]) {
      this.listeners.get(event)?.forEach((cb) => {
        cb(...args);
      });
    }

    connect(_id: string) {
      const conn = new FakeDataConnection();
      this._lastConn = conn;
      return conn;
    }

    destroy() {}
  }

  return { FakePeer, FakeDataConnection };
});

vi.mock("peerjs", () => ({ default: FakePeer }));

import type { ConnStatus } from "../peer/PeerClientService";
import { PeerClientService } from "../peer/PeerClientService";
import type { PeerMessage } from "../peer/protocol";

// The handleMessage logic is private. To drive it from the outside we reach in
// via a typed cast — these tests verify the observable contract (listeners fire
// with the right payload) not the internal shape.
interface PeerClientServiceInternal {
  handleMessage(msg: PeerMessage): void;
}

describe("PeerClientService", () => {
  it("onSchema unsub removes the listener", () => {
    const svc = new PeerClientService();
    const received: unknown[] = [];
    const unsub = svc.onSchema((sources) => {
      received.push(sources);
    });
    expect(svc._listenerCounts().schema).toBe(1);

    unsub();
    expect(svc._listenerCounts().schema).toBe(0);

    // After unsub, a schema message should not reach the callback
    (svc as unknown as PeerClientServiceInternal).handleMessage({
      type: "schema",
      sources: [{ id: "telemachus", name: "T", keys: ["v.altitude"] }],
    });
    expect(received).toEqual([]);
  });

  it("onData unsub removes the listener", () => {
    const svc = new PeerClientService();
    const hits: Array<[string, string, unknown]> = [];
    const unsub = svc.onData((sourceId, key, value) => {
      hits.push([sourceId, key, value]);
    });

    (svc as unknown as PeerClientServiceInternal).handleMessage({
      type: "data",
      sourceId: "telemachus",
      key: "v.altitude",
      value: 42,
    });
    expect(hits).toEqual([["telemachus", "v.altitude", 42]]);

    unsub();
    (svc as unknown as PeerClientServiceInternal).handleMessage({
      type: "data",
      sourceId: "telemachus",
      key: "v.altitude",
      value: 99,
    });
    expect(hits).toHaveLength(1);
  });

  it("handleMessage dispatches each peer message type to the right listener set", () => {
    const svc = new PeerClientService();
    const calls: string[] = [];
    svc.onData(() => calls.push("data"));
    svc.onSourceStatus(() => calls.push("source-status"));
    svc.onSchema(() => calls.push("schema"));
    svc.onKosOpened(() => calls.push("kos-opened"));
    svc.onKosData(() => calls.push("kos-data"));
    svc.onKosClose(() => calls.push("kos-close"));

    const inner = svc as unknown as PeerClientServiceInternal;
    inner.handleMessage({
      type: "data",
      sourceId: "s",
      key: "k",
      value: 1,
    });
    inner.handleMessage({ type: "status", sourceId: "s", status: "connected" });
    inner.handleMessage({ type: "schema", sources: [] });
    inner.handleMessage({ type: "kos-opened", sessionId: "x" });
    inner.handleMessage({ type: "kos-data", sessionId: "x", data: "hi" });
    inner.handleMessage({ type: "kos-close", sessionId: "x" });

    expect(calls).toEqual([
      "data",
      "source-status",
      "schema",
      "kos-opened",
      "kos-data",
      "kos-close",
    ]);
  });

  it("_listenerCounts reports per-event-type sizes", () => {
    const svc = new PeerClientService();
    svc.onData(() => {});
    svc.onData(() => {});
    svc.onSchema(() => {});
    svc.onKosData(() => {});
    expect(svc._listenerCounts()).toEqual({
      data: 2,
      sourceStatus: 0,
      connStatus: 0,
      schema: 1,
      kosOpened: 0,
      kosData: 1,
      kosClose: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Reconnect loop — drives lifecycle via the hoisted FakePeer / FakeDataConnection.
// ---------------------------------------------------------------------------

describe("PeerClientService reconnect loop", () => {
  beforeEach(() => {
    FakePeer.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function driveOpen(peer: InstanceType<typeof FakePeer>) {
    peer.emit("open");
    peer._lastConn?.emit("open");
  }

  it("fires reconnecting → connected when the conn drops and peer is recreated", () => {
    const svc = new PeerClientService({
      retryIntervalMs: 50,
      retryTimeoutMs: 60_000,
    });
    const statuses: ConnStatus[] = [];
    svc.onConnectionStatus((s) => statuses.push(s));

    svc.connect("HOST");
    expect(FakePeer.instances).toHaveLength(1);
    driveOpen(FakePeer.instances[0]);

    // Drop the conn — should schedule a retry
    FakePeer.instances[0]._lastConn?.emit("close");
    expect(statuses).toContain("reconnecting");
    expect(FakePeer.instances).toHaveLength(1); // retry hasn't fired yet

    vi.advanceTimersByTime(50);
    expect(FakePeer.instances).toHaveLength(2);

    driveOpen(FakePeer.instances[1]);
    // Final status sequence should contain the full cycle
    expect(statuses.filter((s) => s === "connected")).toHaveLength(2);
  });

  it("gives up with disconnected after exceeding the retry timeout", () => {
    const svc = new PeerClientService({
      retryIntervalMs: 10,
      retryTimeoutMs: 100,
    });
    const statuses: ConnStatus[] = [];
    svc.onConnectionStatus((s) => statuses.push(s));

    svc.connect("HOST");
    driveOpen(FakePeer.instances[0]);

    // Simulate repeated failed reconnects by firing close on each new peer's
    // conn (or peer error) after the retry timer fires.
    for (let i = 0; i < 20; i++) {
      FakePeer.instances[FakePeer.instances.length - 1]?.emit(
        "error",
        new Error("fail"),
      );
      vi.advanceTimersByTime(11);
      if (statuses.includes("disconnected")) break;
    }

    expect(statuses).toContain("disconnected");
  });

  it("disconnect() stops any pending retry", () => {
    const svc = new PeerClientService({
      retryIntervalMs: 50,
      retryTimeoutMs: 60_000,
    });
    svc.connect("HOST");
    driveOpen(FakePeer.instances[0]);

    FakePeer.instances[0]._lastConn?.emit("close");
    // Retry is scheduled but not yet fired
    svc.disconnect();

    vi.advanceTimersByTime(1000);
    // No new FakePeer should be constructed after disconnect
    expect(FakePeer.instances).toHaveLength(1);
  });
});
