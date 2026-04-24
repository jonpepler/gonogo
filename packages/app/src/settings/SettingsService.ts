/**
 * Thin key/value store for app-wide user preferences. Values are JSON-
 * serialised into a single localStorage slot and fanned out to per-key
 * subscribers so React consumers can `useSyncExternalStore` cheaply.
 *
 * Settings themselves are registered via `registerSetting()` (see registry.ts);
 * this service is just the persistence + subscription layer.
 */

const STORAGE_KEY = "gonogo.settings";

type Listener<T = unknown> = (value: T) => void;

export class SettingsService {
  private values = new Map<string, unknown>();
  private listeners = new Map<string, Set<Listener>>();
  private storage: Storage;

  constructor(storage: Storage = globalThis.localStorage) {
    this.storage = storage;
    this.load();
  }

  get<T>(key: string, fallback: T): T {
    if (!this.values.has(key)) return fallback;
    return this.values.get(key) as T;
  }

  set<T>(key: string, value: T): void {
    // Cheap dedupe — structural compare via JSON since settings are always
    // JSON-serialisable by contract.
    const prev = this.values.get(key);
    if (JSON.stringify(prev) === JSON.stringify(value)) return;
    this.values.set(key, value);
    this.save();
    const bucket = this.listeners.get(key);
    if (bucket) for (const l of bucket) (l as Listener<T>)(value);
  }

  subscribe<T>(key: string, cb: Listener<T>): () => void {
    let bucket = this.listeners.get(key);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(key, bucket);
    }
    bucket.add(cb as Listener);
    return () => bucket.delete(cb as Listener);
  }

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) this.values.set(k, v);
    } catch {
      // Corrupt value — wipe and start clean.
      this.storage.removeItem(STORAGE_KEY);
    }
  }

  private save(): void {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of this.values) obj[k] = v;
    this.storage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
}
