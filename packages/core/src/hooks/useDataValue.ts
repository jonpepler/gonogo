import { useSyncExternalStore, useCallback, useRef } from 'react';
import { getDataSource } from '../registry';

export function useDataValue(dataSourceId: string, key: string): unknown {
  const valueRef = useRef<unknown>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const source = getDataSource(dataSourceId);
      if (!source) return () => {};

      const unsubData = source.subscribe(key, (val) => {
        valueRef.current = val;
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
