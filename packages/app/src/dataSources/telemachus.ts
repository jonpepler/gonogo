import { registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, DataKey, ConfigField } from '@gonogo/core';

interface TelemachusConfig {
  host: string;
  port: number;
}

const DEFAULT_CONFIG: TelemachusConfig = { host: 'localhost', port: 8085 };
const STORAGE_KEY = 'gonogo.datasource.telemachus';

class TelemachusDataSource implements DataSource {
  id = 'telemachus';
  name = 'Telemachus Reborn';
  status: DataSourceStatus = 'disconnected';

  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private ws: WebSocket | null = null;
  private cfg: TelemachusConfig;
  // key → set of subscriber callbacks
  private subscriptions = new Map<string, Set<(value: unknown) => void>>();

  constructor(config?: TelemachusConfig) {
    this.cfg = config ?? this.loadConfig();
  }

  // --- Connection ---

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://${this.cfg.host}:${this.cfg.port}/datalink`;
      this.ws = new WebSocket(url);

      this.ws.addEventListener('open', () => {
        this.setStatus('connected');
        this.sendSubscription(); // re-subscribe after reconnect
        resolve();
      });
      this.ws.addEventListener('message', (event) => {
        this.handleMessage(event.data as string);
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

  // --- Data ---

  schema(): DataKey[] {
    return [];
  }

  subscribe(key: string, cb: (value: unknown) => void): () => void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(cb);
    this.sendSubscription();

    return () => {
      const cbs = this.subscriptions.get(key);
      if (cbs) {
        cbs.delete(cb);
        if (cbs.size === 0) this.subscriptions.delete(key);
      }
      this.sendSubscription();
    };
  }

  async execute(action: string): Promise<void> {
    const url = `http://${this.cfg.host}:${this.cfg.port}/telemachus/datalink?a=${encodeURIComponent(action)}`;
    // no-cors: we don't need to read the response, so skip CORS checking entirely.
    // The request still reaches Telemachus and the action is executed.
    await fetch(url, { mode: 'no-cors' });
  }

  onStatusChange(cb: (status: DataSourceStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  // --- Config ---

  configSchema(): ConfigField[] {
    return [
      { key: 'host', label: 'Host', type: 'text', placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'number', placeholder: '8085' },
    ];
  }

  getConfig(): Record<string, unknown> {
    return { host: this.cfg.host, port: this.cfg.port };
  }

  configure(config: Record<string, unknown>): void {
    this.cfg = {
      host: typeof config.host === 'string' ? config.host : this.cfg.host,
      port: typeof config.port === 'number' ? config.port : Number(config.port) || this.cfg.port,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg));
    } catch { /* localStorage unavailable */ }
    // Always reconnect with the new config.
    this.disconnect();
    void this.connect();
  }

  // --- Private ---

  /**
   * Sends the full current subscription list to Telemachus over the WebSocket.
   * Telemachus will stream back all subscribed values at the given rate.
   */
  private sendSubscription(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.subscriptions.size > 0) {
      this.ws.send(JSON.stringify({ run: [...this.subscriptions.keys()], rate: 250 }));
    }
  }

  private handleMessage(raw: string): void {
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      for (const [key, callbacks] of this.subscriptions) {
        if (key in data) {
          callbacks.forEach((cb) => cb(data[key]));
        }
      }
    } catch { /* ignore malformed messages */ }
  }

  private loadConfig(): TelemachusConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TelemachusConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch { /* ignore */ }
    return DEFAULT_CONFIG;
  }

  private setStatus(status: DataSourceStatus): void {
    this.status = status;
    this.statusListeners.forEach((cb) => cb(status));
  }
}

export const telemachusSource = new TelemachusDataSource();
registerDataSource(telemachusSource);
