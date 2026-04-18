import type { DataSourceStatus } from "@gonogo/core";

export type { DataSourceStatus };

export type PeerMessage =
  | {
      type: "schema";
      sources: Array<{ id: string; name: string; keys: string[] }>;
    }
  | { type: "status"; sourceId: string; status: DataSourceStatus }
  | { type: "data"; sourceId: string; key: string; value: unknown }
  | { type: "execute"; sourceId: string; action: string }
  | { type: "execute-result"; sourceId: string; action: string; error?: string }
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
  | { type: "kos-close"; sessionId: string };
