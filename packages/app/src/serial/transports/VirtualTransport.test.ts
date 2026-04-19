import { describe, expect, it, vi } from "vitest";
import { VirtualTransport } from "./VirtualTransport";

describe("VirtualTransport", () => {
  it("starts disconnected and transitions to connected on connect()", async () => {
    const t = new VirtualTransport("t1");
    const statuses: string[] = [];
    t.onStatus((s) => statuses.push(s));

    expect(t.status).toBe("disconnected");
    await t.connect();
    expect(t.status).toBe("connected");
    expect(statuses).toEqual(["connected"]);

    await t.disconnect();
    expect(t.status).toBe("disconnected");
    expect(statuses).toEqual(["connected", "disconnected"]);
  });

  it("inject() fires onInput subscribers with the inputId and value", () => {
    const t = new VirtualTransport("t1");
    const spy = vi.fn();
    t.onInput(spy);

    t.inject("a", true);
    t.inject("stick-x", 0.42);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, { inputId: "a", value: true });
    expect(spy).toHaveBeenNthCalledWith(2, {
      inputId: "stick-x",
      value: 0.42,
    });
  });

  it("unsubscribe stops further input notifications", () => {
    const t = new VirtualTransport("t1");
    const spy = vi.fn();
    const unsub = t.onInput(spy);

    t.inject("a", true);
    unsub();
    t.inject("a", false);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("write() stores the latest frame and notifies onFrame subscribers", async () => {
    const t = new VirtualTransport("t1");
    const frames: Array<string | Uint8Array> = [];
    t.onFrame((f) => frames.push(f));

    await t.write("frame-a");
    await t.write("frame-b");

    expect(t.lastFrame).toBe("frame-b");
    expect(frames).toEqual(["frame-a", "frame-b"]);
  });
});
