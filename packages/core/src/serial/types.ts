// Serial input platform — shared types (core)
//
// DeviceTypes and DeviceInstances are user-data (persisted to localStorage
// via the SerialDeviceService in @gonogo/app). RenderStyles are code-defined
// and live in a singleton registry here (see ./registry.ts).

export type DeviceInputKind = "button" | "analog";

/**
 * One named input on a DeviceType. For the built-in `char-position` parser,
 * `offset` + `length` describe where in the incoming line this input's value
 * lives. Analog inputs additionally declare `{ min, max }` so raw integers
 * can be normalised to `-1..1`.
 */
export interface DeviceInput {
  id: string;
  name: string;
  kind: DeviceInputKind;
  offset?: number;
  length?: number;
  min?: number;
  max?: number;
}

export type DeviceParserId = "char-position";

export interface DeviceType {
  id: string;
  name: string;
  inputs: DeviceInput[];
  /** Parser used to convert inbound lines to typed input events. */
  parser: DeviceParserId;
  /** Optional render style id — drives output back to the device. */
  renderStyleId?: string;
}

export type DeviceTransportKind = "web-serial" | "virtual";

/**
 * A user-registered physical or virtual device on a given screen. `transport`
 * selects how the SerialDeviceService opens the device; web-serial options
 * are only relevant when `transport === "web-serial"`.
 */
export interface DeviceInstance {
  id: string;
  name: string;
  typeId: string;
  transport: DeviceTransportKind;
  baudRate?: number;
  filters?: SerialPortFilter[];
  portInfo?: { vendorId?: number; productId?: number };
}

/**
 * Code-registered render style. The service calls `render(merged)` with a
 * debounced snapshot of all action-return-values for the device and pipes
 * the result into the transport's `write()`.
 */
export interface DeviceRenderStyle {
  id: string;
  name: string;
  description?: string;
  render(merged: Record<string, unknown>): string | Uint8Array;
}

// ---------------------------------------------------------------------------
// Minimal Web Serial shims — avoid pulling a full `dom-serial` dep for a
// single interface. These match the Web Serial spec subset we actually need.
// ---------------------------------------------------------------------------

export interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}
