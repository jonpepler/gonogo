import { useSyncExternalStore, useCallback, useRef } from 'react';
import { getDataSource } from '../registry';

export function useDataValue<T = unknown>(dataSourceId: string, key: string): T | undefined {
  const valueRef = useRef<T | undefined>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const source = getDataSource(dataSourceId);
      if (!source) return () => {};

      const unsubData = source.subscribe(key, (val) => {
        valueRef.current = val as T;
        onStoreChange();
      });

      // Clear the value when the source disconnects or errors so components
      // show unknown state rather than a stale reading.
      const unsubStatus = source.onStatusChange((status) => {
        if (status !== 'connected') {
          valueRef.current = undefined;
          onStoreChange();
        }
      });

      return () => {
        unsubData();
        unsubStatus();
      };
    },
    [dataSourceId, key],
  );

  const getSnapshot = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
