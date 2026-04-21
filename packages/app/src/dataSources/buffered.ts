import { registerDataSource } from "@gonogo/core";
import {
  BufferedDataSource,
  IndexedDbStore,
  registerBuiltinDerivedKeys,
} from "@gonogo/data";
import { telemachusSource } from "./telemachus";

registerBuiltinDerivedKeys();

/**
 * Wraps the raw telemachus source in a flight-aware, IndexedDB-backed
 * buffer and registers it under id `data`. Widgets that want history
 * (graphs, future push-to-main replays) subscribe through this; raw
 * `telemachus`/`kos` stays registered for callers that genuinely want
 * live-only access (kOS terminal, debug overlays).
 *
 * Connecting is the caller's job — MainScreen calls
 * `bufferedDataSource.connect()` alongside the other sources.
 */
export const bufferedDataSource = new BufferedDataSource({
  source: telemachusSource,
  store: new IndexedDbStore(),
});

registerDataSource(bufferedDataSource);
