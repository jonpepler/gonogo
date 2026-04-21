import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { debugPeer } from "@gonogo/core";
import type { PeerHostService } from "./PeerHostService";

interface Sample {
  t: number;
  v: unknown;
}

interface SeriesRange {
  t: number[];
  v: unknown[];
}

type SampleAware = {
  subscribeSamples: (key: string, cb: (sample: Sample) => void) => () => void;
};

type QueryRangeAware = {
  queryRange: (key: string, from: number, to: number) => Promise<SeriesRange>;
};

function hasSubscribeSamples(source: DataSource): source is DataSource & SampleAware {
  return typeof (source as Partial<SampleAware>).subscribeSamples === "function";
}

function hasQueryRange(source: DataSource): source is DataSource & QueryRangeAware {
  return typeof (source as Partial<QueryRangeAware>).queryRange === "function";
}

export class PeerBroadcastingDataSource implements DataSource {
  private seenKeys = new Set<string>();

  constructor(
    private real: DataSource,
    host: PeerHostService,
  ) {
    const schemaKeys = real.schema();
    debugPeer("PBDS wrap", {
      id: real.id,
      schemaKeyCount: schemaKeys.length,
      sampleAware: hasSubscribeSamples(real),
    });
    // Subscribe to every schema key for the lifetime of the wrapper — we do
    // NOT unsubscribe in disconnect(). Reason: MainScreen's StrictMode
    // mount→unmount→mount cycle calls wrapper.disconnect() between the two
    // setups; if we unsubbed, the broadcast callbacks would be gone on the
    // second mount (real.connect() doesn't re-run the wrapper constructor),
    // and the station would see zero telemetry. The wrapper is registered in
    // the registry for the lifetime of the app, so lifetime-of-wrapper is the
    // correct scope for broadcasting.
    for (const { key } of schemaKeys) {
      if (hasSubscribeSamples(real)) {
        real.subscribeSamples(key, ({ t, v: value }) => {
          if (!this.seenKeys.has(key)) {
            this.seenKeys.add(key);
            debugPeer("PBDS first value", { id: this.id, key });
          }
          host.broadcast({ type: "data", sourceId: this.id, key, value, t });
        });
      } else {
        real.subscribe(key, (value) => {
          if (!this.seenKeys.has(key)) {
            this.seenKeys.add(key);
            debugPeer("PBDS first value", { id: this.id, key });
          }
          host.broadcast({
            type: "data",
            sourceId: this.id,
            key,
            value,
            t: Date.now(),
          });
        });
      }
    }

    this.real.onStatusChange((status) => {
      host.broadcast({ type: "status", sourceId: this.id, status });
    });
  }

  get id() {
    return this.real.id;
  }
  get name() {
    return this.real.name;
  }
  get status() {
    return this.real.status;
  }

  connect() {
    return this.real.connect();
  }

  disconnect() {
    return this.real.disconnect();
  }

  schema(): DataKey[] {
    return this.real.schema();
  }
  configSchema(): ConfigField[] {
    return this.real.configSchema();
  }
  configure(config: Record<string, unknown>) {
    return this.real.configure(config);
  }
  getConfig() {
    return this.real.getConfig();
  }
  setupInstructions() {
    return this.real.setupInstructions?.() ?? null;
  }

  // Clean pass-through — broadcasting is fully decoupled from UI subscriptions.
  subscribe(key: string, cb: (value: unknown) => void) {
    return this.real.subscribe(key, cb);
  }

  onStatusChange(cb: (status: DataSourceStatus) => void) {
    return this.real.onStatusChange(cb);
  }

  async execute(action: string) {
    return this.real.execute(action);
  }

  // The BufferedDataSource extensions `useDataSeries` expects. When the wrapped
  // source doesn't implement them (e.g. a raw telemachus source wrapped for
  // broadcasting), fall back to the base `subscribe` contract and return empty
  // history so the hook keeps working.
  subscribeSamples(key: string, cb: (sample: Sample) => void) {
    if (hasSubscribeSamples(this.real)) {
      return this.real.subscribeSamples(key, cb);
    }
    return this.real.subscribe(key, (value) => {
      cb({ t: Date.now(), v: value });
    });
  }

  async queryRange(key: string, from: number, to: number): Promise<SeriesRange> {
    if (hasQueryRange(this.real)) {
      return this.real.queryRange(key, from, to);
    }
    return { t: [], v: [] };
  }
}
