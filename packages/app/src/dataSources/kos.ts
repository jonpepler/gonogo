import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { registerDataSource } from "@gonogo/core";
import { parseKosMenu, parseListChanged } from "./kos-menu-parser";

export interface KosConfig extends Record<string, unknown> {
  host: string;
  port: number;
  kosHost: string;
  kosPort: number;
  cpuName?: string;
}

const DEFAULT_CONFIG: KosConfig = {
  host: "localhost",
  port: 3001,
  kosHost: "localhost",
  kosPort: 5410,
};
const STORAGE_KEY = "gonogo.datasource.kos";
const RETRY_INTERVAL_MS = 5_000;
const RETRY_TIMEOUT_MS = 5 * 60 * 1000;

interface RetryOptions {
  retryIntervalMs?: number;
  retryTimeoutMs?: number;
}

export class KosDataSource implements DataSource<KosConfig> {
  id = "kos";
  name = "kOS";
  status: DataSourceStatus = "disconnected";

  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private ws: WebSocket | null = null;
  private cfg: KosConfig;
  private subscriptions = new Map<string, Set<(value: unknown) => void>>();

  private intentionalDisconnect = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryStart: number | null = null;
  private readonly retryIntervalMs: number;
  private readonly retryTimeoutMs: number;

  // CPU selection state — only used when cpuName is configured
  private inMenuSelection = false;
  private menuBuffer = "";

  constructor(
    config?: KosConfig,
    {
      retryIntervalMs = RETRY_INTERVAL_MS,
      retryTimeoutMs = RETRY_TIMEOUT_MS,
    }: RetryOptions = {},
  ) {
    this.cfg = config ?? this.loadConfig();
    this.retryIntervalMs = retryIntervalMs;
    this.retryTimeoutMs = retryTimeoutMs;
  }

  // --- Connection ---

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
    this.setStatus("disconnected");
  }

  // --- Data ---

  schema(): DataKey[] {
    return [];
  }

  subscribe(key: string, cb: (value: unknown) => void): () => void {
    if (!this.subscriptions.has(key)) this.subscriptions.set(key, new Set());
    this.subscriptions.get(key)?.add(cb);
    this.sendSubscription();
    return () => {
      this.subscriptions.get(key)?.delete(cb);
      if (this.subscriptions.get(key)?.size === 0)
        this.subscriptions.delete(key);
      this.sendSubscription();
    };
  }

  onStatusChange(cb: (status: DataSourceStatus) => void): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async execute(action: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(action);
    }
  }

  setupInstructions(): string {
    return "The kOS proxy bridges telnet to WebSocket. Run it locally:\n\n  podman compose up -d\n\n(or: docker compose up -d)\n\nfrom the gonogo project root.";
  }

  // --- Config ---

  configSchema(): ConfigField[] {
    return [
      {
        key: "host",
        label: "Proxy Host",
        type: "text",
        placeholder: "localhost",
      },
      { key: "port", label: "Proxy Port", type: "number", placeholder: "3001" },
      {
        key: "kosHost",
        label: "kOS Host",
        type: "text",
        placeholder: "localhost",
      },
      {
        key: "kosPort",
        label: "kOS Port",
        type: "number",
        placeholder: "5410",
      },
      {
        key: "cpuName",
        label: "CPU Name",
        type: "text",
        placeholder: "optional tagname",
      },
    ];
  }

  getConfig(): KosConfig {
    return {
      host: this.cfg.host,
      port: this.cfg.port,
      kosHost: this.cfg.kosHost,
      kosPort: this.cfg.kosPort,
      cpuName: this.cfg.cpuName ?? "",
    };
  }

  configure(config: Record<string, unknown>): void {
    const cpuName =
      typeof config.cpuName === "string" && config.cpuName.trim() !== ""
        ? config.cpuName.trim()
        : undefined;
    this.cfg = {
      host: typeof config.host === "string" ? config.host : this.cfg.host,
      port:
        typeof config.port === "number"
          ? config.port
          : Number(config.port) || this.cfg.port,
      kosHost:
        typeof config.kosHost === "string" ? config.kosHost : this.cfg.kosHost,
      kosPort:
        typeof config.kosPort === "number"
          ? config.kosPort
          : Number(config.kosPort) || this.cfg.kosPort,
      cpuName,
    };
    this.saveConfig();
    this.disconnect();
    void this.connect();
  }

  private loadConfig(): KosConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<KosConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_CONFIG;
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cfg));
    } catch {
      /* localStorage unavailable */
    }
  }

  // --- Private ---

  private openWebSocket(): Promise<void> {
    const old = this.ws;
    this.ws = null;
    old?.close();
    return new Promise((resolve, reject) => {
      const url = `ws://${this.cfg.host}:${this.cfg.port}/kos?host=${encodeURIComponent(this.cfg.kosHost)}&port=${this.cfg.kosPort}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener("open", () => {
        if (this.cfg.cpuName) {
          this.inMenuSelection = true;
          this.menuBuffer = "";
          this.setStatus("reconnecting");
        } else {
          this.setStatus("connected");
          this.sendSubscription();
        }
        resolve();
      });

      ws.addEventListener("message", ({ data }) => {
        const text = typeof data === "string" ? data : String(data);
        if (this.inMenuSelection) {
          this.handleMenuData(text, ws);
        } else {
          this.handleDataMessage(text);
        }
      });

      ws.addEventListener("close", () => {
        if (this.ws === ws) this.onClose();
      });

      ws.addEventListener("error", () => {
        reject(new Error(`Could not connect to kOS proxy at ${url}`));
      });
    });
  }

  private handleMenuData(text: string, ws: WebSocket): void {
    if (parseListChanged(text)) {
      this.menuBuffer = "";
    }

    this.menuBuffer += text;

    const menuState = parseKosMenu(this.menuBuffer);
    if (menuState === null) return;

    const cpu = menuState.cpus.find((c) => c.tagname === this.cfg.cpuName);
    if (cpu) {
      ws.send(`${cpu.number}\n`);
      this.inMenuSelection = false;
      this.menuBuffer = "";
      this.setStatus("connected");
      this.sendSubscription();
    }
    // No match: leave inMenuSelection = true, wait for list-changed and retry
  }

  private handleDataMessage(text: string): void {
    if (parseListChanged(text)) {
      // CPU list changed mid-session — re-enter selection mode if we have a cpuName
      if (this.cfg.cpuName) {
        this.inMenuSelection = true;
        this.menuBuffer = text;
        this.setStatus("reconnecting");
        // Continue processing in case the new menu is in the same chunk
        if (!this.ws) {
          throw new Error(`Websocket not defined: ${JSON.stringify(this.cfg)}`);
        }
        this.handleMenuData("", this.ws);
      }
      return;
    }

    for (const line of text.split("\n")) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq);
      const value = line.slice(eq + 1);
      this.subscriptions.get(key)?.forEach((cb) => {
        cb(value);
      });
    }
  }

  private onClose(): void {
    this.inMenuSelection = false;
    this.menuBuffer = "";

    if (this.intentionalDisconnect) return;

    if (this.retryStart === null) this.retryStart = Date.now();

    if (Date.now() - this.retryStart >= this.retryTimeoutMs) {
      this.retryStart = null;
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");
    this.retryTimer = setTimeout(() => {
      void this.openWebSocket().catch(() => {});
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
      this.ws.send(
        JSON.stringify({
          type: "subscribe",
          keys: [...this.subscriptions.keys()],
        }),
      );
    }
  }

  private setStatus(status: DataSourceStatus): void {
    this.status = status;
    this.statusListeners.forEach((cb) => {
      cb(status);
    });
  }
}

registerDataSource(new KosDataSource());
