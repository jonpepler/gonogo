import type { DeviceInstance, DeviceType } from "@gonogo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SerialDeviceService } from "./SerialDeviceService";
import type { VirtualTransport } from "./transports/VirtualTransport";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    length: 0,
    clear: () => map.clear(),
    key: () => null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  } as Storage;
}

const TYPE: DeviceType = {
  id: "demo",
  name: "Demo",
  parser: "char-position",
  renderStyleId: "text-buffer-168",
  inputs: [
    { id: "a", name: "A", kind: "button" },
    { id: "x", name: "X", kind: "analog", min: 0, max: 100 },
  ],
};

const INSTANCE: DeviceInstance = {
  id: "d1",
  name: "Demo 1",
  typeId: TYPE.id,
  transport: "virtual",
};

async function makeService(
  opts: { renderDebounceMs?: number } = {},
): Promise<SerialDeviceService> {
  const storage = memoryStorage();
  const svc = new SerialDeviceService({
    screenKey: "test",
    storage,
    renderDebounceMs: opts.renderDebounceMs ?? 0,
  });
  // Wipe the seeded defaults so tests have full control.
  for (const d of svc.getDevices()) await svc.removeDevice(d.id);
  for (const t of svc.getDeviceTypes()) await svc.removeDeviceType(t.id);
  return svc;
}

describe("SerialDeviceService", () => {
  let service: SerialDeviceService;

  beforeEach(async () => {
    vi.useFakeTimers();
    service = await makeService();
    service.upsertDeviceType(TYPE);
    service.addDevice(INSTANCE);
  });

  afterEach(async () => {
    await service.destroy();
    vi.useRealTimers();
  });

  it("forwards transport input events to subscribers with the deviceId", () => {
    const events: Array<{ deviceId: string; inputId: string; value: unknown }> =
      [];
    service.onInput((deviceId, event) =>
      events.push({ deviceId, inputId: event.inputId, value: event.value }),
    );

    const transport = service.getTransport("d1") as VirtualTransport;
    transport.inject("a", true);
    transport.inject("x", 0.5);

    expect(events).toEqual([
      { deviceId: "d1", inputId: "a", value: true },
      { deviceId: "d1", inputId: "x", value: 0.5 },
    ]);
  });

  it("recordActionReturn debounces and renders via the registered style", () => {
    const transport = service.getTransport("d1") as VirtualTransport;

    service.recordActionReturn("d1", { ALT: 1 });
    service.recordActionReturn("d1", { THR: 2 });
    // Before the debounce window expires, nothing has been written yet.
    expect(transport.lastFrame).toBeNull();

    vi.advanceTimersByTime(5);
    const frame = transport.lastFrame as string;
    expect(typeof frame).toBe("string");
    const lines = frame.split("\n");
    // Keys are sorted — ALT first, THR second.
    expect(lines[0].startsWith("ALT 1")).toBe(true);
    expect(lines[1].startsWith("THR 2")).toBe(true);
  });

  it("merges sequential action returns into one frame", () => {
    const transport = service.getTransport("d1") as VirtualTransport;

    service.recordActionReturn("d1", { ALT: 1 });
    vi.advanceTimersByTime(5);
    const first = transport.lastFrame as string;

    service.recordActionReturn("d1", { THR: 2 });
    vi.advanceTimersByTime(5);
    const second = transport.lastFrame as string;

    // Second frame retains ALT from the merged state and adds THR.
    expect(first.split("\n")[0].startsWith("ALT 1")).toBe(true);
    expect(second.split("\n")[0].startsWith("ALT 1")).toBe(true);
    expect(second.split("\n")[1].startsWith("THR 2")).toBe(true);
  });

  it("ignores non-object action returns", () => {
    const transport = service.getTransport("d1") as VirtualTransport;

    service.recordActionReturn("d1", undefined);
    service.recordActionReturn("d1", "hello");
    service.recordActionReturn("d1", 42);
    vi.advanceTimersByTime(5);

    expect(transport.lastFrame).toBeNull();
  });

  it("persists device types and instances across service restarts", () => {
    const storage = memoryStorage();
    const first = new SerialDeviceService({
      screenKey: "persist",
      storage,
      renderDebounceMs: 0,
    });
    // Clear seeded defaults so we assert only the change we make.
    for (const d of first.getDevices()) void first.removeDevice(d.id);
    for (const t of first.getDeviceTypes()) first.removeDeviceType(t.id);
    first.upsertDeviceType(TYPE);
    first.addDevice(INSTANCE);

    const second = new SerialDeviceService({
      screenKey: "persist",
      storage,
      renderDebounceMs: 0,
    });
    expect(second.getDeviceTypes().map((t) => t.id)).toContain("demo");
    expect(second.getDevices().map((d) => d.id)).toContain("d1");
  });

  it("removing a device type also removes its instances", async () => {
    await service.removeDeviceType(TYPE.id);
    expect(service.getDevices()).toEqual([]);
    expect(service.getDeviceType(TYPE.id)).toBeUndefined();
  });

  it("connect()/disconnect() reflect on the transport status", async () => {
    expect(service.getStatus("d1")).toBe("disconnected");
    await service.connect("d1");
    expect(service.getStatus("d1")).toBe("connected");
    await service.disconnect("d1");
    expect(service.getStatus("d1")).toBe("disconnected");
  });
});

describe("SerialDeviceService seeding", () => {
  it("seeds the virtual controller type + instance when storage is empty", () => {
    const storage = memoryStorage();
    const svc = new SerialDeviceService({
      screenKey: "fresh",
      storage,
      renderDebounceMs: 0,
    });
    const types = svc.getDeviceTypes();
    const devices = svc.getDevices();
    expect(types.some((t) => t.id === "virtual-controller")).toBe(true);
    expect(devices.some((d) => d.typeId === "virtual-controller")).toBe(true);
  });

  it("does not re-seed once device types exist", async () => {
    const storage = memoryStorage();
    // First service writes a non-default type then tears down.
    const first = new SerialDeviceService({
      screenKey: "noreseed",
      storage,
      renderDebounceMs: 0,
    });
    // Remove the seeded instance/type and add something else so storage is
    // non-empty but without the virtual controller.
    for (const d of first.getDevices()) await first.removeDevice(d.id);
    for (const t of first.getDeviceTypes()) await first.removeDeviceType(t.id);
    first.upsertDeviceType({
      id: "other",
      name: "Other",
      parser: "char-position",
      inputs: [],
    });
    // Re-open. Because types are non-empty, the seeder must not fire.
    const second = new SerialDeviceService({
      screenKey: "noreseed",
      storage,
      renderDebounceMs: 0,
    });
    expect(second.getDeviceType("virtual-controller")).toBeUndefined();
  });
});
