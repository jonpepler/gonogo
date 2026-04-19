import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { debugPeer } from "@gonogo/core";
import type { PeerClientService } from "./PeerClientService";

interface Sample {
  t: number;
  v: unknown;
}

interface SeriesRange {
  t: number[];
  v: unknown[];
}

export class PeerClientDataSource implements DataSource {
  private subscribers = new Map<string, Set<(value: unknown) => void>>();
  private sampleSubscribers = new Map<
    string,
    Set<(sample: Sample) => void>
  >();
  private statusListeners = new Set<(status: DataSourceStatus) => void>();
  private seenKeys = new Set<string>();
  status: DataSourceStatus = "disconnected";

  constructor(
    public id: string,
    public name: string,
    private client: PeerClientService,
  ) {
    client.onData((sourceId, key, value, t) => {
      if (sourceId !== this.id) return;
      if (!this.seenKeys.has(key)) {
        this.seenKeys.add(key);
        debugPeer("PCDS first data", {
          id: this.id,
          key,
          subscriberCount: this.subscribers.get(key)?.size ?? 0,
        });
      }
      this.subscribers.get(key)?.forEach((cb) => {
        cb(value);
      });
      this.sampleSubscribers.get(key)?.forEach((cb) => {
        cb({ t, v: value });
      });
    });
    client.onSourceStatus((sourceId, status) => {
      if (sourceId !== this.id) return;
      this.status = status as DataSourceStatus;
      this.statusListeners.forEach((cb) => {
        cb(this.status);
      });
    });
  }

  connect() {
    this.status = "connected";
    this.statusListeners.forEach((cb) => {
      cb("connected");
    });
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
    this.subscribers.get(key)?.add(cb);
    return () => this.subscribers.get(key)?.delete(cb);
  }

  onStatusChange(cb: (status: DataSourceStatus) => void) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async execute(action: string) {
    this.client.sendExecute(this.id, action);
  }

  /**
   * Timestamped variant of subscribe. Used by `useDataSeries` on station
   * screens so live samples carry the host's clock alongside the value.
   */
  subscribeSamples(key: string, cb: (sample: Sample) => void) {
    let bucket = this.sampleSubscribers.get(key);
    if (!bucket) {
      bucket = new Set();
      this.sampleSubscribers.set(key, bucket);
    }
    bucket.add(cb);
    return () => {
      const b = this.sampleSubscribers.get(key);
      if (!b) return;
      b.delete(cb);
      if (b.size === 0) this.sampleSubscribers.delete(key);
    };
  }

  /**
   * Route a historical range query through PeerJS to the host's buffered
   * data layer. Resolves with the host's columnar response; rejects if the
   * peer drops or the host has no queryRange support for this source.
   */
  async queryRange(
    key: string,
    tStart: number,
    tEnd: number,
    flightId?: string,
  ): Promise<SeriesRange> {
    return this.client.sendQueryRange(
      this.id,
      key,
      tStart,
      tEnd,
      flightId,
    );
  }
}
