import { registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, DataKey, ConfigField } from '@gonogo/core';

interface TelemachusConfig {
  host: string;
  port: number;
}

const DEFAULT_CONFIG: TelemachusConfig = { host: 'localhost', port: 8085 };
const STORAGE_KEY = 'gonogo.datasource.telemachus';
const POLL_INTERVAL_MS = 500;

interface Subscription {
  callbacks: Set<(value: unknown) => void>;
  intervalId: ReturnType<typeof setInterval> | null;
  lastValue: unknown;
}

class TelemachusDataSource implements DataSource {
  id = 'telemachus';
  name = 'Telemachus Reborn';
  status: DataSourceStatus = 'disconnected';

  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private ws: WebSocket | null = null;
  private cfg: TelemachusConfig;
  private subscriptions = new Map<string, Subscription>();

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
        this.startPolling();
        resolve();
      });
      this.ws.addEventListener('close', () => {
        this.stopPolling();
        this.setStatus('disconnected');
      });
      this.ws.addEventListener('error', () => {
        this.stopPolling();
        this.setStatus('error');
        reject(new Error(`Could not connect to Telemachus Reborn at ${url}`));
      });
    });
  }

  disconnect(): void {
    this.stopPolling();
    this.ws?.close();
    this.ws = null;
  }

  // --- Data ---

  schema(): DataKey[] {
    return [];
  }

  subscribe(key: string, cb: (value: unknown) => void): () => void {
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, { callbacks: new Set(), intervalId: null, lastValue: undefined });
    }
    const sub = this.subscriptions.get(key)!;
    sub.callbacks.add(cb);

    if (this.status === 'connected') {
      void this.pollKey(key); // immediate read
      if (sub.intervalId === null) {
        sub.intervalId = setInterval(() => { void this.pollKey(key); }, POLL_INTERVAL_MS);
      }
    }

    return () => {
      sub.callbacks.delete(cb);
      if (sub.callbacks.size === 0) {
        if (sub.intervalId !== null) {
          clearInterval(sub.intervalId);
        }
        this.subscriptions.delete(key);
      }
    };
  }

  async execute(action: string): Promise<void> {
    const url = `${this.baseHttpUrl()}?a=${encodeURIComponent(action)}`;
    await fetch(url);
    // Re-poll subscribed keys so state reflects the action immediately.
    await Promise.all([...this.subscriptions.keys()].map((k) => this.pollKey(k)));
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
    } catch { /* localStorage unavailable (e.g. SSR or private browsing) */ }
    if (this.status === 'connected') {
      this.disconnect();
      void this.connect();
    }
  }

  // --- Private ---

  private baseHttpUrl(): string {
    return `http://${this.cfg.host}:${this.cfg.port}/telemachus/datalink`;
  }

  private async pollKey(key: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseHttpUrl()}?v=${encodeURIComponent(key)}`);
      const data = await response.json() as Record<string, unknown>;
      const value = data['v'];
      const sub = this.subscriptions.get(key);
      if (sub && value !== sub.lastValue) {
        sub.lastValue = value;
        sub.callbacks.forEach((cb) => cb(value));
      }
    } catch { /* network error — ignore, WS handles connection state */ }
  }

  private startPolling(): void {
    for (const [key, sub] of this.subscriptions) {
      void this.pollKey(key);
      if (sub.intervalId === null) {
        sub.intervalId = setInterval(() => { void this.pollKey(key); }, POLL_INTERVAL_MS);
      }
    }
  }

  private stopPolling(): void {
    for (const [, sub] of this.subscriptions) {
      if (sub.intervalId !== null) {
        clearInterval(sub.intervalId);
        sub.intervalId = null;
      }
    }
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
