/**
 * Stable station peer id. Stored in localStorage so a refresh reconnects
 * with the same PeerJS id — the host's GO/NO-GO registry keys by peer id,
 * and without this every refresh registers as a brand-new station and the
 * old entry lingers until its disconnect event arrives.
 *
 * If the broker still thinks the previous session is alive (it can hold the
 * id for ~30–60s after a TCP drop), re-connecting with the same id fires a
 * PeerJS `unavailable-id` error. `PeerClientService.handleUnexpectedClose`
 * already schedules a retry on every peer error, so we don't need any
 * bespoke handling here — the retry loop eventually succeeds when the
 * broker releases the stale id.
 */

const STORAGE_KEY = "gonogo.station.peer-id";

function generateId(): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `station-${uuid}`;
}

export function getStationPeerId(
  storage: Storage = globalThis.localStorage,
): string {
  const existing = storage.getItem(STORAGE_KEY);
  if (existing?.trim()) return existing.trim();
  const id = generateId();
  storage.setItem(STORAGE_KEY, id);
  return id;
}

export function clearStationPeerId(
  storage: Storage = globalThis.localStorage,
): void {
  storage.removeItem(STORAGE_KEY);
}
