import type { DeviceInstance, DeviceType } from "./types";

/**
 * Default device type seeded on first run so the virtual widget is usable
 * without the user manually creating a type. One 1D analog stick (`stick-x`)
 * plus six buttons labelled A–F.
 */
export const VIRTUAL_CONTROLLER_TYPE: DeviceType = {
  id: "virtual-controller",
  name: "Virtual Controller",
  parser: "char-position",
  renderStyleId: "text-buffer-168",
  inputs: [
    { id: "stick-x", name: "Stick X", kind: "analog", min: -100, max: 100 },
    { id: "a", name: "A", kind: "button" },
    { id: "b", name: "B", kind: "button" },
    { id: "c", name: "C", kind: "button" },
    { id: "d", name: "D", kind: "button" },
    { id: "e", name: "E", kind: "button" },
    { id: "f", name: "F", kind: "button" },
  ],
};

/** Default virtual instance seeded on first run. Per-screen. */
export function defaultVirtualDevice(): DeviceInstance {
  return {
    id: "virtual-controller-1",
    name: "Virtual Controller",
    typeId: VIRTUAL_CONTROLLER_TYPE.id,
    transport: "virtual",
  };
}
