import { getDataSource } from "@gonogo/core";
import { useMemo } from "react";
import type { BufferedDataSource } from "../BufferedDataSource";
import type { DataKeyMeta } from "../types";

/**
 * Returns the enriched schema from a `BufferedDataSource` (raw keys +
 * derived keys, all with label/unit/group). Stable for the lifetime of a
 * session — schema keys are registered at connect time and don't change.
 * Phase 6 kOS datastream adds keys dynamically after connect; this memo
 * will need a live schema subscription once that lands.
 */
export function useDataSchema(sourceId = "data"): DataKeyMeta[] {
  return useMemo(() => {
    const source = getDataSource(sourceId) as BufferedDataSource | undefined;
    return source?.schema() ?? [];
  }, [sourceId]);
}
