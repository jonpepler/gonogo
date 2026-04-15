import { useCallback } from "react";
import { getDataSource } from "../registry";

export function useExecuteAction(dataSourceId: string) {
  return useCallback(
    (action: string): Promise<void> => {
      const source = getDataSource(dataSourceId);
      if (!source) return Promise.resolve();
      return source.execute(action);
    },
    [dataSourceId],
  );
}
