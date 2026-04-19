import { debugPeer, logger } from "@gonogo/core";
import Peer, { type DataConnection } from "peerjs";
import type { PeerMessage } from "./protocol";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

const DEFAULT_RETRY_INTERVAL_MS = 2_000;
const DEFAULT_RETRY_TIMEOUT_MS = 5 * 60 * 1000;

export interface PeerClientOptions {
  retryIntervalMs?: number;
  retryTimeoutMs?: number;
}

export class PeerClientService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private hostPeerId: string | null = null;
  private intentionalDisconnect = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryStart: number | null = null;
  private readonly retryIntervalMs: number;
  private readonly retryTimeoutMs: number;

  private dataListeners = new Set<
    (sourceId: string, key: string, value: unknown) => void
  >();
  private sourceStatusListeners = new Set<
    (sourceId: string, status: string) => void
  >();
  private connStatusListeners = new Set<(status: ConnStatus) => void>();
  private schemaListeners = new Set<
    (sources: Array<{ id: string; name: string; keys: string[] }>) => void
  >();
  private kosDataListeners = new Set<
    (sessionId: string, data: string) => void
  >();
  private kosOpenedListeners = new Set<(sessionId: string) => void>();
  private kosCloseListeners = new Set<(sessionId: string) => void>();

  constructor({
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
    retryTimeoutMs = DEFAULT_RETRY_TIMEOUT_MS,
  }: PeerClientOptions = {}) {
    this.retryIntervalMs = retryIntervalMs;
    this.retryTimeoutMs = retryTimeoutMs;
  }

  connect(hostPeerId: string) {
    this.hostPeerId = hostPeerId;
    this.intentionalDisconnect = false;
    this.retryStart = null;
    this.openPeer();
  }

  private openPeer() {
    if (!this.hostPeerId) return;
    logger.info(`[PeerClient] connecting to host=${this.hostPeerId}`);
    this.emitConnStatus("connecting");
    this.peer = new Peer();
    this.peer.on("open", () => {
      if (!this.peer || !this.hostPeerId) return;
      this.conn = this.peer.connect(this.hostPeerId);
      this.conn.on("open", () => {
        logger.info(`[PeerClient] connected to host=${this.hostPeerId}`);
        this.retryStart = null;
        this.emitConnStatus("connected");
      });
      this.conn.on("data", (raw) => this.handleMessage(raw as PeerMessage));
      this.conn.on("close", () => {
        logger.info(`[PeerClient] connection closed`);
        this.handleUnexpectedClose();
      });
      this.conn.on("error", (err) => {
        logger.error("[PeerClient] connection error", err);
      });
    });
    this.peer.on("error", (err) => {
      logger.error("[PeerClient] peer error", err);
      // PeerJS fires "error" for things like unavailable-peer-id when the host
      // is between refreshes. Schedule a retry rather than giving up.
      this.handleUnexpectedClose();
    });
  }

  private handleUnexpectedClose() {
    if (this.intentionalDisconnect) return;
    if (this.retryTimer !== null) return; // already scheduled

    this.tearDownPeer();

    if (this.retryStart === null) this.retryStart = Date.now();
    if (Date.now() - this.retryStart >= this.retryTimeoutMs) {
      logger.warn("[PeerClient] giving up on reconnect");
      this.retryStart = null;
      this.emitConnStatus("disconnected");
      return;
    }

    this.emitConnStatus("reconnecting");
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.openPeer();
    }, this.retryIntervalMs);
  }

  private tearDownPeer() {
    try {
      this.conn?.close();
    } catch {
      /* already closed */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* already destroyed */
    }
    this.peer = null;
    this.conn = null;
  }

  private emitConnStatus(status: ConnStatus) {
    this.connStatusListeners.forEach((cb) => {
      cb(status);
    });
  }

  sendExecute(sourceId: string, action: string) {
    logger.info(`[PeerClient] execute — source=${sourceId} action=${action}`);
    this.conn?.send({
      type: "execute",
      sourceId,
      action,
    } satisfies PeerMessage);
  }

  sendKosOpen(
    sessionId: string,
    params: { kosHost: string; kosPort: number; cols: number; rows: number },
  ) {
    this.conn?.send({
      type: "kos-open",
      sessionId,
      ...params,
    } satisfies PeerMessage);
  }

  sendKosData(sessionId: string, data: string) {
    this.conn?.send({
      type: "kos-data",
      sessionId,
      data,
    } satisfies PeerMessage);
  }

  sendKosResize(sessionId: string, cols: number, rows: number) {
    this.conn?.send({
      type: "kos-resize",
      sessionId,
      cols,
      rows,
    } satisfies PeerMessage);
  }

  sendKosClose(sessionId: string) {
    this.conn?.send({ type: "kos-close", sessionId } satisfies PeerMessage);
  }

  onData(cb: (sourceId: string, key: string, value: unknown) => void) {
    this.dataListeners.add(cb);
    return () => this.dataListeners.delete(cb);
  }

  onSourceStatus(cb: (sourceId: string, status: string) => void) {
    this.sourceStatusListeners.add(cb);
    return () => this.sourceStatusListeners.delete(cb);
  }

  onConnectionStatus(cb: (status: ConnStatus) => void) {
    this.connStatusListeners.add(cb);
    return () => this.connStatusListeners.delete(cb);
  }

  onSchema(
    cb: (sources: Array<{ id: string; name: string; keys: string[] }>) => void,
  ) {
    this.schemaListeners.add(cb);
    return () => this.schemaListeners.delete(cb);
  }

  onKosOpened(cb: (sessionId: string) => void) {
    this.kosOpenedListeners.add(cb);
    return () => this.kosOpenedListeners.delete(cb);
  }

  onKosData(cb: (sessionId: string, data: string) => void) {
    this.kosDataListeners.add(cb);
    return () => this.kosDataListeners.delete(cb);
  }

  onKosClose(cb: (sessionId: string) => void) {
    this.kosCloseListeners.add(cb);
    return () => this.kosCloseListeners.delete(cb);
  }

  /** For tests + DEBUG_PEER diagnostics — exposes listener Set sizes. */
  _listenerCounts() {
    return {
      data: this.dataListeners.size,
      sourceStatus: this.sourceStatusListeners.size,
      connStatus: this.connStatusListeners.size,
      schema: this.schemaListeners.size,
      kosOpened: this.kosOpenedListeners.size,
      kosData: this.kosDataListeners.size,
      kosClose: this.kosCloseListeners.size,
    };
  }

  private handleMessage(msg: PeerMessage) {
    if (msg.type === "data") {
      debugPeer("client handleMessage data", {
        sourceId: msg.sourceId,
        key: msg.key,
        dataListenerCount: this.dataListeners.size,
      });
      this.dataListeners.forEach((cb) => {
        cb(msg.sourceId, msg.key, msg.value);
      });
    } else if (msg.type === "status") {
      this.sourceStatusListeners.forEach((cb) => {
        cb(msg.sourceId, msg.status);
      });
    } else if (msg.type === "schema") {
      logger.info(
        `[PeerClient] schema received — ${msg.sources.length} sources`,
      );
      this.schemaListeners.forEach((cb) => {
        cb(msg.sources);
      });
    } else if (msg.type === "kos-opened") {
      this.kosOpenedListeners.forEach((cb) => {
        cb(msg.sessionId);
      });
    } else if (msg.type === "kos-data") {
      this.kosDataListeners.forEach((cb) => {
        cb(msg.sessionId, msg.data);
      });
    } else if (msg.type === "kos-close") {
      this.kosCloseListeners.forEach((cb) => {
        cb(msg.sessionId);
      });
    }
  }

  disconnect() {
    this.intentionalDisconnect = true;
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.tearDownPeer();
    this.hostPeerId = null;
    logger.info("[PeerClient] disconnected");
  }
}
