// DeviceTransport — abstraction over the physical layer.
//
// Each DeviceInstance gets one transport. The SerialDeviceService owns
// transports, routes parsed input events up to subscribers, and pipes
// rendered frames back down via `write()`.
//
// Transports handle their own parsing so the service stays transport-agnostic.
// - WebSerialTransport runs the configured parser (currently `char-position`)
//   against each line read from the port.
// - VirtualTransport bypasses parsing — widgets and tests inject normalised
//   events directly.

export type TransportStatus = "disconnected" | "connected" | "error";

export type InputValue = boolean | number;

export interface InputEvent {
  inputId: string;
  value: InputValue;
}

export interface DeviceTransport {
  /** Matches DeviceInstance.id. */
  readonly id: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  write(data: string | Uint8Array): Promise<void>;
  onInput(cb: (event: InputEvent) => void): () => void;
  onStatus(cb: (status: TransportStatus, err?: unknown) => void): () => void;
  readonly status: TransportStatus;
  /**
   * Only implemented by virtual transports — drives an input event as if it
   * came from the device. Real transports (Web Serial) omit this.
   */
  inject?(inputId: string, value: boolean | number): void;
  /** Latest rendered frame written by the service. Virtual-only. */
  readonly lastFrame?: string | Uint8Array | null;
  /** Subscribe to frames written via `write()`. Virtual-only. */
  onFrame?(cb: (frame: string | Uint8Array) => void): () => void;
}
