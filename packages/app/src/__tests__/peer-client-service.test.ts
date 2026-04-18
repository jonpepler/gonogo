import { describe, expect, it } from "vitest";
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
