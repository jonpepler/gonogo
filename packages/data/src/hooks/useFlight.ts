import { getDataSource } from "@gonogo/core";
import { useCallback, useSyncExternalStore } from "react";
import type { BufferedDataSource } from "../BufferedDataSource";
import type { FlightRecord } from "../types";

/**
 * Reactive view of the buffered source's current flight. Re-renders on
 * every transition (new, resume, revert). Returns `null` during warmup
 * before the first `v.name` + `v.missionTime` pair has landed.
 */
export function useFlight(sourceId = "data"): FlightRecord | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const source = getDataSource(sourceId) as BufferedDataSource | undefined;
      if (!source?.onFlightChange) return () => {};
      return source.onFlightChange(() => {
        onStoreChange();
      });
    },
    [sourceId],
  );

  const getSnapshot = useCallback(() => {
    const source = getDataSource(sourceId) as BufferedDataSource | undefined;
    return source?.getCurrentFlight() ?? null;
  }, [sourceId]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
