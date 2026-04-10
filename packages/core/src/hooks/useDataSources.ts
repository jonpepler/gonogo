import { useSyncExternalStore, useCallback } from 'react';
import { getDataSources } from '../registry';

export interface DataSourceState {
  id: string;
  name: string;
  status: import('../types').DataSourceStatus;
}

export function useDataSources(): DataSourceState[] {
  const sources = getDataSources();

  // subscribe tells React which external events should trigger a re-check.
  // Stable reference: sources are registered before React mounts.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const unsubscribers = sources.map((s) => s.onStatusChange(onStoreChange));
      return () => unsubscribers.forEach((u) => u());
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // getSnapshot returns a primitive so React can compare by equality.
  const getSnapshot = useCallback(
    () => sources.map((s) => s.status).join(','),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // useSyncExternalStore re-reads the snapshot on every onStoreChange call,
  // and guarantees the update is processed synchronously — eliminating act() warnings
  // caused by WebSocket/external events updating state outside React's scheduler.
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return sources.map((s) => ({ id: s.id, name: s.name, status: s.status }));
}
