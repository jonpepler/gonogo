/**
 * Station identity — a user-editable name for this station screen, scoped
 * to the active save profile so different missions can reuse the same
 * device under different call-signs.
 *
 * The station's PeerJS peer id already exists (assigned by the broker), but
 * it's opaque and changes per session. The name is a human-readable handle
 * for things like GO/NO-GO aggregation and abort attribution.
 *
 * Storage key: `gonogo.station.name.${profileId}`. On first use for a given
 * profile, migrates the legacy unscoped `gonogo.station.name` once if it
 * exists, otherwise seeds a new generated name.
 */

const LEGACY_NAME_KEY = "gonogo.station.name";
const SUFFIX_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function keyFor(profileId: string): string {
  return `gonogo.station.name.${profileId}`;
}

function generateSuffix(): string {
  return Array.from(
    { length: 4 },
    () => SUFFIX_CHARS[Math.floor(Math.random() * SUFFIX_CHARS.length)],
  ).join("");
}

type NameListener = (name: string) => void;

export class StationIdentityService {
  private name: string;
  private listeners = new Set<NameListener>();
  private readonly storage: Storage;
  private readonly key: string;

  constructor(profileId: string, storage: Storage = globalThis.localStorage) {
    this.storage = storage;
    this.key = keyFor(profileId);

    const saved = storage.getItem(this.key);
    if (saved?.trim()) {
      this.name = saved.trim();
      return;
    }

    // One-time migration from the pre-profile key. Consumed here rather than
    // elsewhere so it only fires once per profile — whichever profile gets
    // here first inherits the old name.
    const legacy = storage.getItem(LEGACY_NAME_KEY);
    if (legacy?.trim()) {
      this.name = legacy.trim();
      storage.setItem(this.key, this.name);
      storage.removeItem(LEGACY_NAME_KEY);
      return;
    }

    this.name = `Station ${generateSuffix()}`;
    storage.setItem(this.key, this.name);
  }

  getName(): string {
    return this.name;
  }

  setName(next: string): void {
    const trimmed = next.trim();
    if (!trimmed || trimmed === this.name) return;
    this.name = trimmed;
    this.storage.setItem(this.key, trimmed);
    for (const listener of this.listeners) listener(trimmed);
  }

  onChange(listener: NameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
