// Entry shapes the sdk itself owns, exactly as `FilterEntry` does today
// (`mod/sitrep-sdk/src/api/types.ts`). A component's `EntryFn` is written in
// terms of one of these; the generic parameter is what the widget supplies.

export type FilterSelection = "multi" | "single";

export interface FilterEntry<T> {
  /** Stable id, unique within the contribution that emitted it. */
  id: string;
  label: string;
  group?: string;
  groupLabel?: string;
  selection?: FilterSelection;
  /** True to KEEP the item. */
  predicate: (item: T) => boolean;
}

/** A second entry shape, so the prototype proves the machinery is not
 *  filter-shaped by accident. */
export interface MeterEntry<T> {
  id: string;
  label: string;
  amount: number;
  capacity: number;
  /** Which subject this meter belongs against. */
  belongsTo: (item: T) => boolean;
}
