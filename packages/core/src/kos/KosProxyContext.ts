import { createContext, useContext } from "react";
import { getDataSource } from "../registry";

export interface KosConnection {
  readonly readyState: number;
  addEventListener(type: "open", listener: () => void): void;
  addEventListener(
    type: "message",
    listener: (event: { data: string }) => void,
  ): void;
  addEventListener(type: "close", listener: () => void): void;
  addEventListener(type: "error", listener: () => void): void;
  send(data: string): void;
  close(): void;
}

export interface KosConnectionParams {
  sessionId: string;
  kosHost: string;
  kosPort: number;
  cols: number;
  rows: number;
}

export type KosConnectionFactory = (
  params: KosConnectionParams,
) => KosConnection;
export type KosResizeFn = (
  sessionId: string,
  cols: number,
  rows: number,
) => void;

export interface KosProxyContextValue {
  createConnection: KosConnectionFactory;
  resize: KosResizeFn;
}

function getProxyAddress() {
  const cfg = getDataSource("kos")?.getConfig() as
    | { host?: string; port?: number }
    | undefined;
  const host = cfg?.host ?? "localhost";
  const port = cfg?.port ?? 3001;
  return { host, port };
}

const defaultValue: KosProxyContextValue = {
  createConnection: ({ sessionId, kosHost, kosPort, cols, rows }) => {
    const { host, port } = getProxyAddress();
    const url =
      `ws://${host}:${port}/kos` +
      `?host=${encodeURIComponent(kosHost)}&port=${kosPort}` +
      `&id=${sessionId}&cols=${cols}&rows=${rows}`;
    return new WebSocket(url) as unknown as KosConnection;
  },
  resize: (sessionId, cols, rows) => {
    const { host, port } = getProxyAddress();
    fetch(`http://${host}:${port}/kos/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, cols, rows }),
    }).catch(() => {});
  },
};

export const KosProxyContext =
  createContext<KosProxyContextValue>(defaultValue);
export const useKosProxy = () => useContext(KosProxyContext);
