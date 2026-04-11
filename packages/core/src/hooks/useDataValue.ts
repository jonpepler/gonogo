import { useSyncExternalStore, useCallback, useRef } from 'react';
import { getDataSource } from '../registry';

export function useDataValue(dataSourceId: string, key: string): unknown {
  const valueRef = useRef<unknown>(undefined);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const source = getDataSource(dataSourceId);
      if (!source) return () => {};
      return source.subscribe(key, (val) => {
        valueRef.current = val;
        onStoreChange();
      });
    },
    [dataSourceId, key],
  );

  const getSnapshot = useCallback(() => valueRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
