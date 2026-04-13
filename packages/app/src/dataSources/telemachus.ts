import { registerDataSource } from '@gonogo/core';
import type { DataSource, DataSourceStatus, DataKey, ConfigField } from '@gonogo/core';

export interface TelemachusConfig extends Record<string, unknown> {
  host: string;
  port: number;
}

const DEFAULT_CONFIG: TelemachusConfig = { host: 'localhost', port: 8085 };
const STORAGE_KEY = 'gonogo.datasource.telemachus';
const RETRY_INTERVAL_MS = 5_000;
const RETRY_TIMEOUT_MS = 5 * 60 * 1000;

interface RetryOptions {
  retryIntervalMs?: number;
  retryTimeoutMs?: number;
}

export class TelemachusDataSource implements DataSource<TelemachusConfig> {
  id = 'telemachus';
  name = 'Telemachus Reborn';
  status: DataSourceStatus = 'disconnected';

  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private ws: WebSocket | null = null;
  private cfg: TelemachusConfig;
  private subscriptions = new Map<string, Set<(value: unknown) => void>>();

  private intentionalDisconnect = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryStart: number | null = null;
  private readonly retryIntervalMs: number;
  private readonly retryTimeoutMs: number;

  constructor(config?: TelemachusConfig, { retryIntervalMs = RETRY_INTERVAL_MS, retryTimeoutMs = RETRY_TIMEOUT_MS }: RetryOptions = {}) {
    this.cfg = config ?? this.loadConfig();
    this.retryIntervalMs = retryIntervalMs;
    this.retryTimeoutMs = retryTimeoutMs;
  }

  // --- Connection (public) ---

  /** Explicitly connect, resetting any ongoing retry loop. */
  connect(): Promise<void> {
    this.stopRetrying();
    this.retryStart = null;
    this.intentionalDisconnect = false;
    return this.openWebSocket();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.stopRetrying();
    this.ws?.close();
    this.ws = null;
    this.setStatus('disconnected');
  }

  // --- Data ---

  schema(): DataKey[] {
    return [];
  }

  subscribe(key: string, cb: (value: unknown) => void): () => void {
    const isNewKey = !this.subscriptions.has(key);
    if (isNewKey) this.subscriptions.set(key, new Set());
    this.subscriptions.get(key)!.add(cb);

    if (isNewKey && this.ws?.readyState === WebSocket.OPEN) {
      // Include rate on the first key to establish the update interval
      const msg = this.subscriptions.size === 1
        ? { '+': [key], rate: 250 }
        : { '+': [key] };
      this.ws.send(JSON.stringify(msg));
    }

    return () => {
      const cbs = this.subscriptions.get(key);
      if (cbs) {
        cbs.delete(cb);
        if (cbs.size === 0) {
          this.subscriptions.delete(key);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ '-': [key] }));
          }
        }
      }
    };
  }

  async execute(action: string): Promise<void> {
    const url = `http://${this.cfg.host}:${this.cfg.port}/telemachus/datalink?a=${encodeURIComponent(action)}`;
    // no-cors: we don't need to read the response back, so skip CORS checking.
    // The request still reaches Telemachus and state changes stream back via WS.
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

  getConfig(): TelemachusConfig {
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
    this.disconnect();
    void this.connect();
  }

  // --- Private ---

  private openWebSocket(): Promise<void> {
    const old = this.ws;
    this.ws = null;
    old?.close();
    return new Promise((resolve, reject) => {
      const url = `ws://${this.cfg.host}:${this.cfg.port}/datalink`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.setStatus('connected');
        this.sendSubscription();
        resolve();
      });
      ws.addEventListener('message', (event) => {
        this.handleMessage(event.data as string);
      });
      ws.addEventListener('close', () => {
        if (this.ws === ws) this.onClose();
      });
      ws.addEventListener('error', () => {
        reject(new Error(`Could not connect to Telemachus Reborn at ${url}`));
      });
    });
  }

  private onClose(): void {
    if (this.retryStart === null) this.retryStart = Date.now();

    if (Date.now() - this.retryStart >= this.retryTimeoutMs) {
      this.retryStart = null;
      this.setStatus('disconnected'); // gave up — manual retry needed
      return;
    }

    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      void this.openWebSocket().catch(() => {
        // error event fires first and rejects; close event will call onClose() again
      });
    }, this.retryIntervalMs);
  }

  private stopRetrying(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private sendSubscription(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.subscriptions.size > 0) {
      this.ws.send(JSON.stringify({ '+': [...this.subscriptions.keys()], rate: 250 }));
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
