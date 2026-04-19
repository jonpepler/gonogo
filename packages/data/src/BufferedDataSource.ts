import type {
  ConfigField,
  DataKey,
  DataSource,
  DataSourceStatus,
} from "@gonogo/core";
import { FlightDetector } from "./flightDetector";
import { debugFlight } from "./logger";
import type { Store } from "./storage/Store";
import type { FlightRecord, Sample, SeriesRange } from "./types";

type Clock = () => number;

interface Options {
  /** Source id under which this buffered layer is registered. Defaults to `"data"`. */
  id?: string;
  /** Human name. Defaults to a derived value. */
  name?: string;
  /** Upstream data source to wrap (e.g. the telemachus source). */
  source: DataSource;
  /** Persistence. Usually an `IndexedDbStore`; `MemoryStore` in tests. */
  store: Store;
  /**
   * Number of samples kept in memory per key for `getLatest()`. 500 covers
   * ~2 minutes at 4Hz, enough for the graph widget's initial window
   * without awaiting a `queryRange` round-trip.
   */
  inMemoryLimit?: number;
  /** Injectable clock, mostly for tests. Defaults to `Date.now`. */
  now?: Clock;
}

interface SampleRow {
  t: number;
  v: unknown;
}

/**
 * Wraps a live `DataSource`, persists every sample into a `Store` keyed by
 * inferred flight id, and exposes both live subscriptions (matching the
 * DataSource contract) and columnar range queries (the graph widget's
 * primary read path).
 *
 * Subscription semantics mirror the wrapped source: callbacks fire on new
 * samples only, not on subscribe. For historical backfill, callers use
 * `queryRange` or the `useDataSeries` hook (which composes both).
 *
 * Flight identification runs off `v.name` + `v.missionTime` for now; a
 * `vesselUid` sourced from kOS (Phase 6) will take precedence once
 * available. The detector is seeded from persisted flights on `connect()`
 * so we resume rather than duplicate after a reload.
 */
export class BufferedDataSource implements DataSource {
  readonly id: string;
  readonly name: string;
  private readonly source: DataSource;
  private readonly store: Store;
  private readonly detector = new FlightDetector();
  private readonly inMemoryLimit: number;
  private readonly now: Clock;

  private latestName: string | null = null;

  private readonly buffers = new Map<string, SampleRow[]>();
  private readonly keySubscribers = new Map<
    string,
    Set<(value: unknown) => void>
  >();
  private readonly sampleSubscribers = new Map<
    string,
    Set<(sample: Sample) => void>
  >();
  private readonly statusSubscribers = new Set<
    (status: DataSourceStatus) => void
  >();
  private readonly flightSubscribers = new Set<
    (flight: FlightRecord | null) => void
  >();

  private upstreamUnsubs: Array<() => void> = [];
  private upstreamStatusUnsub: (() => void) | null = null;
  private lastEmittedCurrent: FlightRecord | null = null;

  constructor(opts: Options) {
    this.id = opts.id ?? "data";
    this.name = opts.name ?? `Buffered ${opts.source.name}`;
    this.source = opts.source;
    this.store = opts.store;
    this.inMemoryLimit = opts.inMemoryLimit ?? 500;
    this.now = opts.now ?? Date.now;
  }

  // --- DataSource surface ------------------------------------------------

  get status(): DataSourceStatus {
    return this.source.status;
  }

  /**
   * Sets up the wrapper's subscriptions to the wrapped source. Does NOT
   * call `source.connect()` — the wrapped source's connection lifecycle
   * belongs to whoever registered it. Typically both sources are
   * registered independently and the caller's "connect all registered
   * sources" loop connects each exactly once.
   */
  async connect(): Promise<void> {
    // Hydrate detector with any flights that already exist in the store so
    // we resume rather than duplicate across reloads.
    const known = await this.store.listFlights();
    this.detector.hydrate(known);

    // Subscribe to every key the upstream exposes. We don't filter — the
    // graph widget may want any of them. Telemachus schema is static so
    // this is a fixed cost at connect time.
    for (const { key } of this.source.schema()) {
      const unsub = this.source.subscribe(key, (value) => {
        this.handleSample(key, value);
      });
      this.upstreamUnsubs.push(unsub);
    }

    this.upstreamStatusUnsub = this.source.onStatusChange((status) => {
      this.statusSubscribers.forEach((cb) => {
        cb(status);
      });
    });
  }

  /**
   * Tears down the wrapper's subscriptions. The wrapped source is NOT
   * disconnected here — same reasoning as `connect`.
   */
  disconnect(): void {
    for (const u of this.upstreamUnsubs) u();
    this.upstreamUnsubs = [];
    this.upstreamStatusUnsub?.();
    this.upstreamStatusUnsub = null;
  }

  schema(): DataKey[] {
    return this.source.schema();
  }

  subscribe(key: string, cb: (value: unknown) => void): () => void {
    let bucket = this.keySubscribers.get(key);
    if (!bucket) {
      bucket = new Set();
      this.keySubscribers.set(key, bucket);
    }
    bucket.add(cb);
    return () => {
      const b = this.keySubscribers.get(key);
      if (!b) return;
      b.delete(cb);
      if (b.size === 0) this.keySubscribers.delete(key);
    };
  }

  onStatusChange(cb: (status: DataSourceStatus) => void): () => void {
    this.statusSubscribers.add(cb);
    return () => {
      this.statusSubscribers.delete(cb);
    };
  }

  execute(action: string): Promise<void> {
    return this.source.execute(action);
  }

  configSchema(): ConfigField[] {
    return this.source.configSchema();
  }

  configure(config: Record<string, unknown>): void {
    this.source.configure(config);
  }

  getConfig(): Record<string, unknown> {
    return this.source.getConfig();
  }

  setupInstructions(): string | null {
    return this.source.setupInstructions?.() ?? null;
  }

  // --- Buffered-layer extensions ----------------------------------------

  /**
   * Columnar range query. Always hits the store, so pending writes are
   * flushed first. Defaults `flightId` to the current flight when omitted.
   */
  async queryRange(
    key: string,
    tStart: number,
    tEnd: number,
    flightId?: string,
  ): Promise<SeriesRange> {
    const id = flightId ?? this.detector.getCurrent()?.id;
    if (!id) return { t: [], v: [] };
    return this.store.queryRange(id, key, tStart, tEnd);
  }

  /**
   * Latest N samples for a key from the in-memory ring buffer. Synchronous
   * — useful for the graph widget's first paint before any async query
   * completes. May return fewer samples than requested, including zero.
   */
  getLatest(key: string, n = this.inMemoryLimit): SeriesRange {
    const buf = this.buffers.get(key);
    if (!buf || buf.length === 0) return { t: [], v: [] };
    const start = Math.max(0, buf.length - n);
    const slice = buf.slice(start);
    return {
      t: slice.map((r) => r.t),
      v: slice.map((r) => r.v),
    };
  }

  /**
   * Timestamped variant of `subscribe`. Fires on every sample with both
   * the store-side timestamp and value — used by `useDataSeries` so its
   * appended points share the store's clock (matters in tests where the
   * store uses an injected `now()`).
   */
  subscribeSamples(key: string, cb: (sample: Sample) => void): () => void {
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

  onFlightChange(cb: (flight: FlightRecord | null) => void): () => void {
    this.flightSubscribers.add(cb);
    return () => {
      this.flightSubscribers.delete(cb);
    };
  }

  listFlights(): Promise<FlightRecord[]> {
    return this.store.listFlights();
  }

  getCurrentFlight(): FlightRecord | null {
    return this.detector.getCurrent();
  }

  async deleteFlight(id: string): Promise<void> {
    const wasCurrent = this.detector.getCurrent()?.id === id;
    this.detector.forget(id);
    await this.store.deleteFlight(id);
    if (wasCurrent) this.emitFlightChange();
  }

  async clearAllFlights(): Promise<void> {
    this.detector.forgetAll();
    await this.store.clearAllFlights();
    this.buffers.clear();
    this.emitFlightChange();
  }

  // --- Internal ----------------------------------------------------------

  private handleSample(key: string, value: unknown): void {
    // Cache the identity inputs regardless — the detector needs both and
    // they may arrive in separate callbacks within the same WS message.
    // `v.missionTime` drives the detector directly so we only cache name.
    if (key === "v.name" && typeof value === "string") {
      this.latestName = value;
    }

    const t = this.now();

    // Run the detector off v.missionTime as the driver — it ticks every
    // frame with a numeric value, and by the time it arrives in a given
    // WS message, v.name has already been processed.
    if (key === "v.missionTime" && this.latestName !== null) {
      const before = this.detector.getCurrent();
      const decision = this.detector.observe({
        vesselName: this.latestName,
        missionTime: value as number,
        now: t,
      });
      void this.store.upsertFlight(decision.flight);
      if (!before || before.id !== decision.flight.id) {
        this.emitFlightChange();
      }
    }

    const current = this.detector.getCurrent();

    // Append to store + in-memory buffer only if we've identified a flight.
    // Samples arriving before v.name/v.missionTime have landed are dropped
    // — a short warmup on first connect.
    if (current) {
      void this.store.appendSample(current.id, key, t, value);
      this.pushToBuffer(key, t, value);
    } else {
      debugFlight("drop-pre-flight", { key });
    }

    // Fan out to live subscribers regardless of whether we have a flight;
    // useDataValue callers get live values during warmup.
    const subs = this.keySubscribers.get(key);
    if (subs) {
      subs.forEach((cb) => {
        cb(value);
      });
    }

    // Fan out timestamped samples (only when a flight is established —
    // useDataSeries consumers don't want pre-flight noise).
    if (current) {
      const sampleSubs = this.sampleSubscribers.get(key);
      if (sampleSubs) {
        sampleSubs.forEach((cb) => {
          cb({ t, v: value });
        });
      }
    }
  }

  private pushToBuffer(key: string, t: number, v: unknown): void {
    let buf = this.buffers.get(key);
    if (!buf) {
      buf = [];
      this.buffers.set(key, buf);
    }
    buf.push({ t, v });
    if (buf.length > this.inMemoryLimit) {
      // Trim from the front in chunks of 1 — cheap enough at 4Hz; move
      // to a circular buffer if this ever shows up in profiling.
      buf.shift();
    }
  }

  private emitFlightChange(): void {
    const next = this.detector.getCurrent();
    if (next === this.lastEmittedCurrent) return;
    this.lastEmittedCurrent = next;
    this.flightSubscribers.forEach((cb) => {
      cb(next);
    });
  }
}
