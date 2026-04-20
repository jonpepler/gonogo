import { debugPeer, logger } from "@gonogo/core";
import Peer, { type DataConnection } from "peerjs";
import { loadIceServers } from "./iceServers";
import type { PeerMessage } from "./protocol";

const PEER_ID_KEY = "gonogo-host-peer-id";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I/L

function generateShortId(): string {
  return Array.from(
    { length: 4 },
    () => CHARS[Math.floor(Math.random() * CHARS.length)],
  ).join("");
}

function getOrCreatePeerId(): string {
  const saved = localStorage.getItem(PEER_ID_KEY);
  if (saved) return saved;
  const id = generateShortId();
  localStorage.setItem(PEER_ID_KEY, id);
  return id;
}

interface KosSession {
  ws: WebSocket;
  conn: DataConnection;
}

export class PeerHostService {
  private peer: Peer | null = null;
  private connections: Set<DataConnection> = new Set();
  private idListeners = new Set<(id: string | null) => void>();
  private kosSessions = new Map<string, KosSession>();
  private ocislyProxyPeerId: string | null = null;
  peerId: string | null = null;

  start() {
    const peerId = getOrCreatePeerId();
    const iceServers = loadIceServers();
    this.peer = new Peer(
      peerId,
      iceServers.length > 0 ? { config: { iceServers } } : undefined,
    );

    this.peer.on("open", (id) => {
      localStorage.setItem(PEER_ID_KEY, id);
      this.peerId = id;
      logger.info(`[PeerHost] open — id=${id}`);
      this.idListeners.forEach((cb) => {
        cb(id);
      });
    });

    this.peer.on("connection", (conn) => {
      logger.info(`[PeerHost] incoming connection from ${conn.peer}`);
      conn.on("open", () => {
        this.connections.add(conn);
        logger.info(
          `[PeerHost] connection open — peer=${conn.peer}, total=${this.connections.size}`,
        );
        this.sendSchema(conn);
        // Station needs this to reach the OCISLY proxy directly — resend
        // whenever a new station connects so latecomers aren't stuck in
        // "disconnected".
        if (this.ocislyProxyPeerId !== null) {
          conn.send({
            type: "ocisly-proxy-peer-id",
            peerId: this.ocislyProxyPeerId,
          } satisfies PeerMessage);
        }
      });
      conn.on("data", (raw) => this.handleIncoming(raw as PeerMessage, conn));
      conn.on("close", () => {
        this.connections.delete(conn);
        this.closeKosSessionsForConn(conn);
        logger.info(
          `[PeerHost] connection closed — peer=${conn.peer}, total=${this.connections.size}`,
        );
      });
      conn.on("error", (err) => {
        logger.error(`[PeerHost] connection error — peer=${conn.peer}`, err);
      });
    });

    this.peer.on("error", (err) => {
      logger.error("[PeerHost] peer error", err);
    });
  }

  /**
   * Set (and broadcast) the current OCISLY proxy peer id. Called by the
   * host-side OcislyStreamSource once it resolves the id over HTTP. Passing
   * null tears it back down for all stations.
   */
  setOcislyProxyPeerId(peerId: string | null) {
    this.ocislyProxyPeerId = peerId;
    this.broadcast({ type: "ocisly-proxy-peer-id", peerId });
  }

  /**
   * Returns a Promise that resolves with the open Peer instance once the
   * broker handshake completes. Used by services that need to make outgoing
   * peer connections of their own (e.g. OcislyStreamSource calling the
   * ocisly-proxy). Resolves immediately if already open.
   */
  waitForPeer(): Promise<Peer> {
    if (this.peer && this.peerId) return Promise.resolve(this.peer);
    return new Promise<Peer>((resolve) => {
      const remove = this.onPeerIdChange(() => {
        if (this.peer && this.peerId) {
          remove();
          resolve(this.peer);
        }
      });
    });
  }

  broadcast(msg: PeerMessage) {
    debugPeer("host broadcast", {
      type: msg.type,
      sourceId: "sourceId" in msg ? msg.sourceId : undefined,
      key: "key" in msg ? msg.key : undefined,
      connections: this.connections.size,
    });
    for (const conn of this.connections) {
      conn.send(msg);
    }
  }

  onPeerIdChange(cb: (id: string | null) => void) {
    this.idListeners.add(cb);
    return () => this.idListeners.delete(cb);
  }

  private sendSchema(conn: DataConnection) {
    import("@gonogo/core").then(({ getDataSources }) => {
      const sources = getDataSources().map((s) => ({
        id: s.id,
        name: s.name,
        keys: s.schema().map((k) => k.key),
      }));
      const msg: PeerMessage = { type: "schema", sources };
      conn.send(msg);
      logger.info(
        `[PeerHost] schema sent to ${conn.peer} — ${sources.length} sources`,
      );
    });
  }

  private handleIncoming(msg: PeerMessage, conn: DataConnection) {
    debugPeer("host handleIncoming", {
      type: msg.type,
      peer: conn.peer,
      sessionId: "sessionId" in msg ? msg.sessionId : undefined,
    });
    if (msg.type === "execute") {
      logger.info(
        `[PeerHost] execute — source=${msg.sourceId} action=${msg.action}`,
      );
      import("@gonogo/core").then(({ getDataSource }) => {
        getDataSource(msg.sourceId)?.execute(msg.action);
      });
      return;
    }

    if (msg.type === "query-range-request") {
      void this.handleQueryRangeRequest(msg, conn);
      return;
    }

    if (msg.type === "kos-open") {
      void this.handleKosOpen(msg, conn);
      return;
    }

    if (msg.type === "kos-data") {
      const session = this.kosSessions.get(msg.sessionId);
      if (session?.ws.readyState === WebSocket.OPEN) {
        session.ws.send(msg.data);
      }
      return;
    }

    if (msg.type === "kos-resize") {
      void this.handleKosResize(msg);
      return;
    }

    if (msg.type === "kos-close") {
      const session = this.kosSessions.get(msg.sessionId);
      if (session) {
        // Remove before closing so the WS close event doesn't echo kos-close back.
        this.kosSessions.delete(msg.sessionId);
        session.ws.close();
      }
      return;
    }
  }

  private async handleQueryRangeRequest(
    msg: Extract<PeerMessage, { type: "query-range-request" }>,
    conn: DataConnection,
  ) {
    const { getDataSource } = await import("@gonogo/core");
    const source = getDataSource(msg.sourceId) as
      | (ReturnType<typeof getDataSource> & {
          queryRange?: (
            key: string,
            tStart: number,
            tEnd: number,
            flightId?: string,
          ) => Promise<{ t: number[]; v: unknown[] }>;
        })
      | undefined;
    const respond = (
      t: number[],
      v: unknown[],
      error?: string,
    ) => {
      conn.send({
        type: "query-range-response",
        requestId: msg.requestId,
        t,
        v,
        error,
      } satisfies PeerMessage);
    };
    if (!source || typeof source.queryRange !== "function") {
      respond([], [], `source ${msg.sourceId} has no queryRange`);
      return;
    }
    try {
      const range = await source.queryRange(
        msg.key,
        msg.tStart,
        msg.tEnd,
        msg.flightId,
      );
      respond(range.t, range.v);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("[PeerHost] queryRange failed", error);
      respond([], [], error.message);
    }
  }

  private async handleKosOpen(
    msg: Extract<PeerMessage, { type: "kos-open" }>,
    conn: DataConnection,
  ) {
    // Close any existing session with this ID (StrictMode fires effects twice).
    // Remove from map BEFORE closing so the close-event handler doesn't echo
    // kos-close back to the station.
    const existing = this.kosSessions.get(msg.sessionId);
    if (existing) {
      this.kosSessions.delete(msg.sessionId);
      existing.ws.close();
    }

    const { getDataSource } = await import("@gonogo/core");
    const kosConfig = getDataSource("kos")?.getConfig() as
      | { host?: string; port?: number; kosHost?: string; kosPort?: number }
      | undefined;
    const proxyHost = kosConfig?.host ?? "localhost";
    const proxyPort = kosConfig?.port ?? 3001;
    // Always use the host's kos config for the actual kOS address — stations
    // don't have a real kos data source and would send localhost as a fallback.
    const kosHost = kosConfig?.kosHost ?? msg.kosHost;
    const kosPort = kosConfig?.kosPort ?? msg.kosPort;

    const url =
      `ws://${proxyHost}:${proxyPort}/kos` +
      `?host=${encodeURIComponent(kosHost)}&port=${kosPort}` +
      `&id=${msg.sessionId}&cols=${msg.cols}&rows=${msg.rows}`;

    logger.info(`[PeerHost] kos-open — session=${msg.sessionId} url=${url}`);

    const ws = new WebSocket(url);
    this.kosSessions.set(msg.sessionId, { ws, conn });

    ws.addEventListener("open", () => {
      conn.send({
        type: "kos-opened",
        sessionId: msg.sessionId,
      } satisfies PeerMessage);
    });

    ws.addEventListener("message", (e) => {
      const data = typeof e.data === "string" ? e.data : String(e.data);
      conn.send({
        type: "kos-data",
        sessionId: msg.sessionId,
        data,
      } satisfies PeerMessage);
    });

    ws.addEventListener("close", () => {
      // If this ws has already been replaced (e.g. a duplicate kos-open arrived
      // and swapped in a newer session), ignore its late close — otherwise we'd
      // wipe the live replacement out of the map and fire a spurious kos-close.
      const current = this.kosSessions.get(msg.sessionId);
      if (current?.ws !== ws) return;
      this.kosSessions.delete(msg.sessionId);
      conn.send({
        type: "kos-close",
        sessionId: msg.sessionId,
      } satisfies PeerMessage);
    });

    ws.addEventListener("error", () => {
      // Ignore errors from a ws we've already replaced — its CONNECTING→CLOSED
      // transition (from the replacement close()) fires "error" as well as
      // "close", and logging it would just be noise.
      const current = this.kosSessions.get(msg.sessionId);
      if (current?.ws !== ws) return;
      logger.error(`[PeerHost] kos ws error — session=${msg.sessionId}`);
    });
  }

  private async handleKosResize(
    msg: Extract<PeerMessage, { type: "kos-resize" }>,
  ) {
    const { getDataSource } = await import("@gonogo/core");
    const kosConfig = getDataSource("kos")?.getConfig() as
      | { host?: string; port?: number }
      | undefined;
    const proxyHost = kosConfig?.host ?? "localhost";
    const proxyPort = kosConfig?.port ?? 3001;

    fetch(`http://${proxyHost}:${proxyPort}/kos/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: msg.sessionId,
        cols: msg.cols,
        rows: msg.rows,
      }),
    }).catch(() => {});
  }

  private closeKosSessionsForConn(conn: DataConnection) {
    for (const [sessionId, session] of this.kosSessions) {
      if (session.conn === conn) {
        // Remove before closing so the WS close event doesn't try to notify a disconnected peer.
        this.kosSessions.delete(sessionId);
        session.ws.close();
        logger.info(
          `[PeerHost] kos session closed on peer disconnect — session=${sessionId}`,
        );
      }
    }
  }

  stop() {
    for (const session of this.kosSessions.values()) {
      session.ws.close();
    }
    this.kosSessions.clear();
    this.peer?.destroy();
    this.peer = null;
    this.peerId = null;
    this.idListeners.forEach((cb) => {
      cb(null);
    });
    logger.info("[PeerHost] stopped");
  }
}

export const peerHostService = new PeerHostService();
