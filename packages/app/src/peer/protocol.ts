import type { DataSourceStatus } from "@gonogo/core";

export type { DataSourceStatus };

export type PeerMessage =
  | {
      type: "schema";
      sources: Array<{ id: string; name: string; keys: string[] }>;
    }
  | { type: "status"; sourceId: string; status: DataSourceStatus }
  // `t` is the host's sample timestamp, optional so partial deploys stay
  // wire-compatible — the client falls back to Date.now() when absent.
  | { type: "data"; sourceId: string; key: string; value: unknown; t?: number }
  | { type: "execute"; sourceId: string; action: string }
  | { type: "execute-result"; sourceId: string; action: string; error?: string }
  | {
      type: "query-range-request";
      requestId: string;
      sourceId: string;
      key: string;
      tStart: number;
      tEnd: number;
      flightId?: string;
    }
  | {
      type: "query-range-response";
      requestId: string;
      t: number[];
      v: unknown[];
      error?: string;
    }
  | {
      type: "kos-open";
      sessionId: string;
      kosHost: string;
      kosPort: number;
      cols: number;
      rows: number;
    }
  | { type: "kos-opened"; sessionId: string }
  | { type: "kos-data"; sessionId: string; data: string }
  | { type: "kos-resize"; sessionId: string; cols: number; rows: number }
  | { type: "kos-close"; sessionId: string }
  // Broadcast from host → stations so stations know which peer to connect to
  // for camera streams. Sent on initial station connect (if known) and again
  // whenever the proxy is re-resolved. null means the main screen no longer
  // has a live proxy connection.
  | { type: "ocisly-proxy-peer-id"; peerId: string | null }
  // ──────────────────────────────────────────────────────────────────────
  // GO/NO-GO and launch coordination
  // ──────────────────────────────────────────────────────────────────────
  // Station → host on connect and whenever the user renames the station.
  // Host keys peer id → name for grid attribution and abort reporting.
  | { type: "station-info"; name: string }
  // Station → host whenever the local GO/NO-GO vote changes. `null` means
  // "no widget mounted" so the station-info is still registered but the
  // station doesn't contribute a vote.
  | { type: "gonogo-vote"; status: "go" | "no-go" | null }
  // Host → stations when all connected stations have voted GO. `t0Ms` is a
  // wall-clock (`Date.now()`) instant — pre-synchronise to the host so the
  // countdown display matches across devices within a small skew.
  | { type: "gonogo-countdown-start"; t0Ms: number }
  // Host → stations when a vote flips to NO-GO during an active countdown
  // or when a station disconnects mid-countdown.
  | { type: "gonogo-countdown-cancel"; reason?: string }
  // Station → host after launch, when the operator hits the big red ABORT
  // button. Host re-sends the action group execution for `f.abort`.
  | { type: "gonogo-abort" }
  // Host → stations: someone triggered the abort. Carries the name so all
  // screens can show who did it.
  | { type: "gonogo-abort-notify"; stationName: string; t: number };
