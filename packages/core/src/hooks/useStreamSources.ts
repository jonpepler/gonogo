import { useCallback, useSyncExternalStore } from "react";
import { getStreamSources } from "../streamRegistry";
import type { DataSourceStatus } from "../types";

export interface StreamSourceState {
  id: string;
  name: string;
  status: DataSourceStatus;
  streamCount: number;
}

export function useStreamSources(): StreamSourceState[] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const unsubscribers = getStreamSources().flatMap((s) => [
      s.onStatusChange(onStoreChange),
      s.onStreamsChange(onStoreChange),
    ]);
    return () =>
      unsubscribers.forEach((u) => {
        u();
      });
  }, []);

  const getSnapshot = useCallback(
    () =>
      getStreamSources()
        .map((s) => `${s.status}:${s.listStreams().length}`)
        .join(","),
    [],
  );

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return getStreamSources().map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    streamCount: s.listStreams().length,
  }));
}
