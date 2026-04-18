import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { debugPeer } from "@gonogo/core";
import type { PeerClientService } from "./PeerClientService";

export class PeerClientDataSource implements DataSource {
  private subscribers = new Map<string, Set<(value: unknown) => void>>();
  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private seenKeys = new Set<string>();
  status: DataSourceStatus = "disconnected";

  constructor(
    public id: string,
    public name: string,
    private client: PeerClientService,
  ) {
    client.onData((sourceId, key, value) => {
      if (sourceId !== this.id) return;
      if (!this.seenKeys.has(key)) {
        this.seenKeys.add(key);
        debugPeer("PCDS first data", {
          id: this.id,
          key,
          subscriberCount: this.subscribers.get(key)?.size ?? 0,
        });
      }
      this.subscribers.get(key)?.forEach((cb) => cb(value));
    });
    client.onSourceStatus((sourceId, status) => {
      if (sourceId !== this.id) return;
      this.status = status as DataSourceStatus;
      this.statusListeners.forEach((cb) => cb(this.status));
    });
  }

  connect() {
    this.status = "connected";
    this.statusListeners.forEach((cb) => cb("connected"));
    return Promise.resolve();
  }

  disconnect() {}

  schema(): DataKey[] {
    return [];
  }
  configSchema(): ConfigField[] {
    return [];
  }
  configure() {}
  getConfig() {
    return {} as Record<string, unknown>;
  }
  setupInstructions() {
    return null;
  }

  subscribe(key: string, cb: (value: unknown) => void) {
    if (!this.subscribers.has(key)) this.subscribers.set(key, new Set());
    this.subscribers.get(key)!.add(cb);
    return () => this.subscribers.get(key)?.delete(cb);
  }

  onStatusChange(cb: (status: DataSourceStatus) => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async execute(action: string) {
    this.client.sendExecute(this.id, action);
  }
}
