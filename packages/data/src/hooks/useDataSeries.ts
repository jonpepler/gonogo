import { getDataSource } from "@gonogo/core";
import { useCallback, useRef, useSyncExternalStore } from "react";
import type { BufferedDataSource } from "../BufferedDataSource";
import type { SeriesRange } from "../types";

const EMPTY: SeriesRange = { t: [], v: [] };

/**
 * Windowed time-series of a single key from the buffered data layer.
 *
 * On mount (or when `key`/`windowSec` changes): backfills from
 * `queryRange` so the graph renders with history immediately.
 *
 * Live: appends every timestamped sample, trimming samples older than
 * `now - windowSec * 1000`.
 *
 * Returns a fresh `SeriesRange` object per update so React's snapshot
 * comparison triggers a re-render — the internal arrays are mutated in
 * place for cheap appends, then a shallow `{ t, v }` wrapper is built at
 * snapshot time.
 */
export function useDataSeries(
  sourceId: "data",
  key: string,
  windowSec: number,
): SeriesRange {
  // Mutable internal storage. Kept outside React state so live appends
  // don't allocate new arrays per sample.
  const dataRef = useRef<{ t: number[]; v: unknown[] }>({ t: [], v: [] });
  // Snapshot identity — bumped (new object) every time onStoreChange fires
  // so useSyncExternalStore detects the change.
  const snapshotRef = useRef<SeriesRange>(EMPTY);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const source = getDataSource(sourceId) as BufferedDataSource | undefined;
      if (!source) return () => {};

      const windowMs = windowSec * 1000;
      dataRef.current = { t: [], v: [] };
      snapshotRef.current = EMPTY;

      let cancelled = false;

      // Backfill from the store.
      const now = Date.now();
      void source.queryRange(key, now - windowMs, now).then((range) => {
        if (cancelled) return;
        dataRef.current = { t: [...range.t], v: [...range.v] };
        snapshotRef.current = {
          t: dataRef.current.t,
          v: dataRef.current.v,
        };
        onStoreChange();
      });

      // Live updates via the timestamped API so our appended points share
      // the buffered source's clock.
      const unsubSamples = source.subscribeSamples(key, ({ t, v }) => {
        const buf = dataRef.current;
        buf.t.push(t);
        buf.v.push(v);
        // Trim anything older than the window.
        const cutoff = t - windowMs;
        let i = 0;
        while (i < buf.t.length && buf.t[i] < cutoff) i++;
        if (i > 0) {
          buf.t.splice(0, i);
          buf.v.splice(0, i);
        }
        snapshotRef.current = { t: buf.t, v: buf.v };
        // New wrapper identity on every sample so getSnapshot's identity
        // check triggers a render.
        snapshotRef.current = {
          t: snapshotRef.current.t,
          v: snapshotRef.current.v,
        };
        onStoreChange();
      });

      // Clear snapshot on upstream status transitions off "connected" so
      // graphs don't render stale data during disconnects.
      const unsubStatus = source.onStatusChange((status) => {
        if (status !== "connected") {
          dataRef.current = { t: [], v: [] };
          snapshotRef.current = EMPTY;
          onStoreChange();
        }
      });

      return () => {
        cancelled = true;
        unsubSamples();
        unsubStatus();
      };
    },
    [sourceId, key, windowSec],
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
