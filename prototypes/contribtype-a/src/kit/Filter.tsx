// ---------------------------------------------------------------------------
// A slot-aware ui-kit component. In the real tree: `@ksp-gonogo/ui-kit`.
//
// Note what this file knows and what it does not. It knows its own component
// id ("filter") and it owns its entry type (`FilterEntry<Row>`). It does NOT
// know a single widget id, and nothing here has to change when a new widget
// mounts a filter. That is the "component-led" half.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import {
  getContributionsForSlot,
  type RowName,
  type SlotSpec,
  slotSpec,
} from "./slots";

/** The entry a contributor feeds a filter slot. Component-owned, per the brief. */
export interface FilterEntry<T> {
  /** Stable id, unique within the contribution that emitted it. */
  id: string;
  label: string;
  /** Facets sharing an axis. Omit for a standalone filter. */
  group?: string;
  /** True to KEEP the row. */
  predicate: (item: T) => boolean;
}

/** What the HOST passes when it renders a filter. Also component-owned. */
export interface FilterProps {
  /** Operator-facing label above the toggles. */
  label?: string;
  compact?: boolean;
}

// The component self-registers its kind into both seams at module load, the
// type-level twin of ui-kit's own `registerUnit(...)` call.
declare module "./slots" {
  interface SlotKindEntries<Row> {
    filter: FilterEntry<Row>;
  }
  interface SlotKindProps<Row> {
    filter: FilterProps;
  }
}

function FilterBar(slotId: string, props: FilterProps): ReactElement | null {
  const entries = getContributionsForSlot(slotId);
  return (
    <div data-slot={slotId} data-compact={props.compact ?? false}>
      {props.label ? <span>{props.label}</span> : null}
      {entries.map((c) => (
        <button type="button" key={c.id}>
          {c.id}
        </button>
      ))}
    </div>
  );
}

/**
 * Declare a filter instance. `Row` is the host widget's row type: the widget
 * states it once here, and every contributor's `predicate` is typed against it
 * from the other side of the facade without either party naming the other.
 *
 * Curried because TS has no partial type-argument inference: `Row` is stated,
 * the topic union is inferred from the literal array.
 */
export function filterSlot<const Rows extends RowName>(rows: Rows) {
  return <const Topics extends string = never>(
    options: { topics?: readonly Topics[] } = {},
  ): SlotSpec<"filter", Rows, Topics> =>
    slotSpec<"filter", Rows, Topics>(
      "filter",
      rows,
      options.topics ?? [],
      (slotId, props) => FilterBar(slotId, props as FilterProps),
    );
}
