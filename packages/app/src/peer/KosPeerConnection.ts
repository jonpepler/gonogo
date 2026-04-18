import type { KosConnection, KosConnectionParams } from "@gonogo/core";
import type { PeerClientService } from "./PeerClientService";

type EventType = "open" | "message" | "close" | "error";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyListener = (...args: any[]) => void;

export class KosPeerConnection implements KosConnection {
  readyState: number = WebSocket.CONNECTING;

  private listeners = new Map<EventType, Set<AnyListener>>();
  private unsubs: (() => void)[] = [];

  constructor(
    private sessionId: string,
    private client: PeerClientService,
    params: Omit<KosConnectionParams, "sessionId">,
  ) {
    this.unsubs.push(
      client.onKosOpened((sid) => {
        if (sid !== this.sessionId) return;
        if (this.readyState !== WebSocket.CONNECTING) return; // guard against duplicates
        this.readyState = WebSocket.OPEN;
        this.emit("open");
      }),
      client.onKosData((sid, data) => {
        if (sid !== this.sessionId) return;
        this.emit("message", { data });
      }),
      client.onKosClose((sid) => {
        if (sid !== this.sessionId) return;
        this.readyState = WebSocket.CLOSED;
        this.emit("close");
        this.cleanup();
      }),
    );

    client.sendKosOpen(sessionId, params);
  }

  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: EventType, listener: AnyListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  send(data: string) {
    if (this.readyState !== WebSocket.OPEN) return;
    this.client.sendKosData(this.sessionId, data);
  }

  close() {
    if (this.readyState === WebSocket.CLOSED) return;
    // Always notify the host — even mid-handshake (CONNECTING). The host's
    // kos-close handler no-ops on unknown sessionIds, so this is safe, and it
    // prevents a pending proxy session from outliving the station-side mount
    // that requested it.
    this.client.sendKosClose(this.sessionId);
    this.readyState = WebSocket.CLOSED;
    this.cleanup();
  }

  private emit(type: EventType, e?: { data: string }) {
    this.listeners.get(type)?.forEach((cb) => cb(e));
  }

  private cleanup() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}
