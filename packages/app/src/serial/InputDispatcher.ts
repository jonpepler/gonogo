import { dispatchAction } from "@gonogo/core";
import type { DashboardItem } from "../components/Dashboard";
import type { SerialDeviceService } from "./SerialDeviceService";
import type { InputEvent } from "./transports/DeviceTransport";

interface Options {
  /**
   * Live source of dashboard items. The dispatcher holds a reference and
   * reads it on every serial event, so changes to items or inputMappings are
   * picked up immediately.
   */
  getItems: () => readonly DashboardItem[];
  service: SerialDeviceService;
}

/**
 * Routes serial input events to the action dispatcher:
 *
 *   transport.inject / real bytes
 *        → SerialDeviceService.onInput
 *        → InputDispatcher.handleInput
 *        → for each dashboard item with a matching mapping,
 *            dispatchAction(instanceId, actionId, payload)
 *        → handler returns { key: value, ... }
 *        → SerialDeviceService.recordActionReturn — debounced render → transport.write()
 *
 * Constructed per-screen; the owner calls `dispose()` on unmount.
 */
export class InputDispatcher {
  private readonly getItems: () => readonly DashboardItem[];
  private readonly service: SerialDeviceService;
  private readonly unsubInput: () => void;

  constructor(opts: Options) {
    this.getItems = opts.getItems;
    this.service = opts.service;
    this.unsubInput = this.service.onInput((deviceId, event) => {
      this.handleInput(deviceId, event);
    });
  }

  dispose(): void {
    this.unsubInput();
  }

  private handleInput(deviceId: string, event: InputEvent): void {
    const items = this.getItems();
    for (const item of items) {
      const mappings = item.inputMappings;
      if (!mappings) continue;
      for (const [actionId, binding] of Object.entries(mappings)) {
        if (!binding) continue;
        if (binding.deviceId !== deviceId) continue;
        if (binding.inputId !== event.inputId) continue;
        const returned = dispatchAction(item.i, actionId, {
          kind: typeof event.value === "boolean" ? "button" : "analog",
          value: event.value,
        });
        if (returned !== undefined) {
          this.service.recordActionReturn(deviceId, returned);
        }
      }
    }
  }
}
