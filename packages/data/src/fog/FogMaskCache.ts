/**
 * In-memory cache of fog-of-war masks, backed by `FogMaskStore`.
 *
 * Masks are allocated lazily — a body only consumes memory once the ship has
 * actually visited it. First-view loads from IndexedDB are async; callers
 * subscribe via `onChange` and redraw when the mask arrives.
 *
 * Mutations are cheap (direct byte writes on the caller's side); persistence
 * is debounced so rapid consecutive paints coalesce into a single IDB write.
 */

import type { FogMaskStore } from "./FogMaskStore";

export interface BodyMask {
  readonly bodyId: string;
  readonly width: number;
  readonly height: number;
  /** Alpha bytes, row-major. Mutable — caller writes directly. */
  data: Uint8Array;
}

interface CacheEntry {
  mask: BodyMask;
  dirty: boolean;
  loading: boolean;
  listeners: Set<(mask: BodyMask) => void>;
}

interface CacheOptions {
  /** Debounce in ms between the first mutation and the next flush. */
  flushDebounceMs?: number;
  /** Default mask dimensions when allocating a fresh mask. */
  width?: number;
  height?: number;
}

export const DEFAULT_MASK_WIDTH = 2048;
export const DEFAULT_MASK_HEIGHT = 1024;
const DEFAULT_DEBOUNCE_MS = 10_000;

export class FogMaskCache {
  private entries = new Map<string, CacheEntry>();
  private inflight = new Map<string, Promise<BodyMask>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly width: number;
  private readonly height: number;
  private readonly debounceMs: number;

  constructor(
    private store: FogMaskStore,
    private profileId: string,
    opts: CacheOptions = {},
  ) {
    this.width = opts.width ?? DEFAULT_MASK_WIDTH;
    this.height = opts.height ?? DEFAULT_MASK_HEIGHT;
    this.debounceMs = opts.flushDebounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  /**
   * Load a mask for the given body. First call per body hits IDB; subsequent
   * calls return the cached instance synchronously (via a resolved promise).
   * Concurrent first-calls dedupe via an in-flight promise map.
   *
   * Note: a zeroed stub entry may already exist if `onChange` was called
   * first (e.g. from `useBodyFogMask` subscribing before kicking off the
   * async load). We must still hit IDB in that case — check `loading`, not
   * just presence.
   */
  async acquire(bodyId: string): Promise<BodyMask> {
    const existing = this.entries.get(bodyId);
    if (existing && !existing.loading) return existing.mask;
    const pending = this.inflight.get(bodyId);
    if (pending) return pending;

    const load = this.loadOrAllocate(bodyId);
    this.inflight.set(bodyId, load);
    try {
      return await load;
    } finally {
      this.inflight.delete(bodyId);
    }
  }

  /** Synchronous accessor — returns undefined if not yet acquired. */
  get(bodyId: string): BodyMask | undefined {
    return this.entries.get(bodyId)?.mask;
  }

  /**
   * Mark the given body's mask as dirty and notify subscribers. Also schedules
   * a debounced flush.
   */
  markDirty(bodyId: string): void {
    const entry = this.entries.get(bodyId);
    if (!entry) return;
    entry.dirty = true;
    for (const listener of entry.listeners) listener(entry.mask);
    this.scheduleFlush();
  }

  onChange(
    bodyId: string,
    listener: (mask: BodyMask) => void,
  ): () => void {
    const entry = this.ensureEntryShell(bodyId);
    entry.listeners.add(listener);
    return () => entry.listeners.delete(listener);
  }

  /** Flush all dirty masks synchronously (awaitable). */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const writes: Array<Promise<void>> = [];
    for (const [bodyId, entry] of this.entries) {
      if (!entry.dirty) continue;
      entry.dirty = false;
      writes.push(
        this.store.save(
          this.profileId,
          bodyId,
          entry.mask.data,
          entry.mask.width,
          entry.mask.height,
        ),
      );
    }
    await Promise.all(writes);
  }

  /** Zero the mask in memory and remove it from IDB. */
  async clear(bodyId: string): Promise<void> {
    const entry = this.entries.get(bodyId);
    if (entry) {
      entry.mask.data.fill(0);
      entry.dirty = false;
      for (const listener of entry.listeners) listener(entry.mask);
    }
    await this.store.clear(this.profileId, bodyId);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.flush();
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Ensure an entry shell exists so subscribers can attach before the async
   * load finishes. The shell is replaced in place by `loadOrAllocate`.
   */
  private ensureEntryShell(bodyId: string): CacheEntry {
    let entry = this.entries.get(bodyId);
    if (entry) return entry;
    entry = {
      mask: {
        bodyId,
        width: this.width,
        height: this.height,
        data: new Uint8Array(this.width * this.height),
      },
      dirty: false,
      loading: true,
      listeners: new Set(),
    };
    this.entries.set(bodyId, entry);
    return entry;
  }

  private async loadOrAllocate(bodyId: string): Promise<BodyMask> {
    const entry = this.ensureEntryShell(bodyId);
    const stored = await this.store.load(this.profileId, bodyId);
    if (
      stored &&
      stored.width === this.width &&
      stored.height === this.height
    ) {
      // Preserve the existing mask reference (callers may already hold it)
      // by copying bytes in place.
      entry.mask.data.set(stored.data);
    }
    // Mismatched dimensions: treat as a fresh start. The already-zeroed
    // buffer from the shell stands in.
    entry.loading = false;
    for (const listener of entry.listeners) listener(entry.mask);
    return entry.mask;
  }

  private scheduleFlush(): void {
    if (this.disposed) return;
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch(() => {
        // Swallow — next dirty mark will reschedule. Persistent failures
        // would need an observable error path, but worth adding only once
        // we have a case where it matters.
      });
    }, this.debounceMs);
  }
}
