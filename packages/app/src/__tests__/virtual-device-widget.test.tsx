/**
 * Integration test for the VirtualDevice widget: pressing a button on the
 * widget → VirtualTransport.inject → SerialDeviceService event →
 * InputDispatcher → mapped action handler runs.
 */

import {
  __setVirtualDeviceServiceAccessor,
  VirtualDeviceComponent,
} from "@gonogo/components";
import {
  clearActionHandlers,
  DashboardItemContext,
  registerActionHandler,
} from "@gonogo/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardItem } from "../components/Dashboard";
import { InputDispatcher } from "../serial/InputDispatcher";
import { SerialDeviceService } from "../serial/SerialDeviceService";

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

beforeEach(() => clearActionHandlers());
afterEach(() => cleanup());

describe("VirtualDevice widget", () => {
  it("pressing a button dispatches the mapped action", async () => {
    const service = new SerialDeviceService({
      screenKey: "vdw",
      storage: memoryStorage(),
      renderDebounceMs: 0,
    });
    for (const d of service.getDevices()) await service.removeDevice(d.id);
    for (const t of service.getDeviceTypes())
      await service.removeDeviceType(t.id);

    service.upsertDeviceType({
      id: "panel",
      name: "Panel",
      parser: "char-position",
      inputs: [
        { id: "a", name: "A", kind: "button" },
        { id: "b", name: "B", kind: "button" },
      ],
    });
    service.addDevice({
      id: "panel-1",
      name: "Panel 1",
      typeId: "panel",
      transport: "virtual",
    });
    await service.connect("panel-1");

    __setVirtualDeviceServiceAccessor(() => service);

    const toggleSpy = vi.fn();
    registerActionHandler("ag-1", "toggle", (payload) => {
      toggleSpy(payload);
      return undefined;
    });

    const items: DashboardItem[] = [
      {
        i: "ag-1",
        componentId: "action-group",
        inputMappings: { toggle: { deviceId: "panel-1", inputId: "a" } },
      },
    ];
    const dispatcher = new InputDispatcher({ service, getItems: () => items });

    render(
      <DashboardItemContext.Provider value={{ instanceId: "vd-1" }}>
        <VirtualDeviceComponent id="vd-1" config={{ deviceId: "panel-1" }} />
      </DashboardItemContext.Provider>,
    );

    const btnA = screen.getByRole("button", { name: "A" });
    fireEvent.pointerDown(btnA);

    expect(toggleSpy).toHaveBeenCalledWith({ kind: "button", value: true });

    fireEvent.pointerUp(btnA);
    expect(toggleSpy).toHaveBeenCalledWith({ kind: "button", value: false });

    dispatcher.dispose();
    await service.destroy();
  });

  it("shows the rendered frame produced by an action handler", async () => {
    const service = new SerialDeviceService({
      screenKey: "vdw2",
      storage: memoryStorage(),
      renderDebounceMs: 0,
    });
    for (const d of service.getDevices()) await service.removeDevice(d.id);
    for (const t of service.getDeviceTypes())
      await service.removeDeviceType(t.id);

    service.upsertDeviceType({
      id: "panel",
      name: "Panel",
      parser: "char-position",
      renderStyleId: "text-buffer-168",
      inputs: [{ id: "a", name: "A", kind: "button" }],
    });
    service.addDevice({
      id: "panel-2",
      name: "Panel 2",
      typeId: "panel",
      transport: "virtual",
    });
    await service.connect("panel-2");

    __setVirtualDeviceServiceAccessor(() => service);

    registerActionHandler("ag-1", "toggle", () => ({ HELLO: 42 }));
    const items: DashboardItem[] = [
      {
        i: "ag-1",
        componentId: "action-group",
        inputMappings: { toggle: { deviceId: "panel-2", inputId: "a" } },
      },
    ];
    const dispatcher = new InputDispatcher({ service, getItems: () => items });

    render(
      <DashboardItemContext.Provider value={{ instanceId: "vd-2" }}>
        <VirtualDeviceComponent id="vd-2" config={{ deviceId: "panel-2" }} />
      </DashboardItemContext.Provider>,
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "A" }));

    // Let render-debounce microtasks flush.
    await new Promise((r) => setTimeout(r, 5));

    const frameEl = await screen.findByText(/HELLO 42/);
    expect(frameEl).toBeInTheDocument();

    dispatcher.dispose();
    await service.destroy();
  });
});
