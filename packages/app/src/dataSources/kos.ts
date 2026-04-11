import { registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, DataKey, ConfigField } from '@gonogo/core';

class KosDataSource implements DataSource {
  id = 'kos';
  name = 'kOS';
  status: DataSourceStatus = 'disconnected';

  private listeners = new Set<(status: DataSourceStatus) => void>();

  async connect(): Promise<void> {
    // TODO: connect to @gonogo/proxy WebSocket bridge (ws://localhost:3001/kos)
    // The proxy handles the telnet session with kOS
  }

  disconnect(): void {
    // TODO: close WebSocket connection to proxy
    this.setStatus('disconnected');
  }

  schema(): DataKey[] {
    // TODO: return available kOS script output keys
    return [];
  }

  subscribe(_key: string, _cb: (value: unknown) => void): () => void {
    // TODO: subscribe to a kOS telemetry key via the proxy
    return () => {};
  }

  onStatusChange(cb: (status: DataSourceStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async execute(_action: string): Promise<void> {
    // TODO: send action through proxy WebSocket
  }

  configSchema(): ConfigField[] {
    return [
      { key: 'host', label: 'Proxy Host', type: 'text', placeholder: 'localhost' },
      { key: 'port', label: 'Proxy Port', type: 'number', placeholder: '3001' },
    ];
  }

  getConfig(): Record<string, unknown> {
    return { host: 'localhost', port: 3001 };
  }

  configure(_config: Record<string, unknown>): void {
    // TODO: update proxy host/port and reconnect
  }

  private setStatus(status: DataSourceStatus): void {
    this.status = status;
    this.listeners.forEach((cb) => cb(status));
  }
}

registerDataSource(new KosDataSource());
