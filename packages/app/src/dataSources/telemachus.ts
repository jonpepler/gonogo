import { registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, DataKey } from '@gonogo/core';

interface TelemachusConfig {
  host: string;
  port: number;
}

const defaultConfig: TelemachusConfig = {
  host: 'localhost',
  port: 8085,
};

class TelemachusDataSource implements DataSource {
  id = 'telemachus';
  name = 'Telemachus Reborn';
  status: DataSourceStatus = 'disconnected';

  private listeners = new Set<(status: DataSourceStatus) => void>();
  private ws: WebSocket | null = null;
  private config: TelemachusConfig;

  constructor(config: TelemachusConfig = defaultConfig) {
    this.config = config;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.config.host}:${this.config.port}/datalink`;
      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.setStatus('connected');
        resolve();
      });
      this.ws.addEventListener('close', () => this.setStatus('disconnected'));
      this.ws.addEventListener('error', () => {
        this.setStatus('error');
        reject(new Error(`Could not connect to Telemachus Reborn at ${url}`));
      });
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  schema(): DataKey[] {
    // TODO: return available telemetry keys from Telemachus Reborn
    return [];
  }

  subscribe(_key: string, _cb: (value: unknown) => void): () => void {
    // TODO: subscribe to a Telemachus Reborn telemetry key
    return () => {};
  }

  onStatusChange(cb: (status: DataSourceStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(status: DataSourceStatus): void {
    this.status = status;
    this.listeners.forEach((cb) => cb(status));
  }
}

export const telemachusSource = new TelemachusDataSource();
registerDataSource(telemachusSource);
