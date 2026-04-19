import { useCallback, useRef, useSyncExternalStore } from "react";
import { getDataSource } from "../registry";
import type { DataSourceRegistry } from "../types";

/**
 * Subscribe to a live value from a registered data source.
 *
 * **Typed overload** — when the source ID is registered in `DataSourceRegistry`,
 * the key is constrained to valid keys for that source and the return type is
 * inferred automatically:
 *
 *   // DataSourceRegistry has { data: { 'v.altitude': number; ... } }
 *   const alt = useDataValue('data', 'v.altitude');
 *   //    ^ number | undefined  ✓  — no <T> annotation needed
 *
 * **Fallback overload** — for sources not yet in the registry, or when an
 * explicit type annotation is preferred (backward-compatible with existing code):
 *
 *   const val = useDataValue<boolean>('data', dynamicKey);
 *   //    ^ boolean | undefined
 */
// Typed overload: source is in DataSourceRegistry → key and return type are inferred
export function useDataValue<
  TSource extends keyof DataSourceRegistry,
  TKey extends keyof DataSourceRegistry[TSource] & string,
>(
  dataSourceId: TSource,
  key: TKey,
): DataSourceRegistry[TSource][TKey] | undefined;

// Fallback overload: source NOT in DataSourceRegistry, or explicit T annotation.
// Excludes known source IDs so that passing a registered source with an invalid
// key produces a compile error rather than silently falling through to unknown.
export function useDataValue<T = unknown>(
  dataSourceId: Exclude<string, keyof DataSourceRegistry>,
  key: string,
): T | undefined;

// Implementation (not part of the public API surface)
export function useDataValue(dataSourceId: string, key: string): unknown {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const valueRef = useRef<unknown>(undefined);

  // eslint-disable-next-line react-hooks/rules-of-hooks
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
        if (status !== "connected") {
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

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const getSnapshot = useCallback(() => valueRef.current, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
