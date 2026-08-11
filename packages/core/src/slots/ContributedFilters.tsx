import type { ContributionRows, FilterEntry } from "@ksp-gonogo/sitrep-sdk";
import { FilterBar } from "@ksp-gonogo/ui-kit";
import type { ReactElement, ReactNode } from "react";
import { useFilterEngine } from "../contributedFilters";
import { useSlotContributions } from "../contributionsRuntime";

// ---------------------------------------------------------------------------
// The contributable-filters component (contribution-slots-spec §15), the
// whole widget-facing surface of the mechanism. A widget with a filterable
// list wraps that list in this component and is done:
//
//   <ContributedFilters rows="ResourceOpsUnit" items={units}>
//     {(filtered) => <MyRows units={filtered} />}
//   </ContributedFilters>
//
// Mounting it is what makes the `filters.<rows>` slot live in this widget;
// this component reads the contributed entries, renders the FilterBar, holds
// the selection, and hands the widget its own rows back, filtered. The
// widget never touches the contribution system: it names its row contract
// once (`rows`, typed against the sdk's ContributionRows seam so it cannot
// disagree with `items`) and only sees its own rows come back.
//
// The taxonomy belongs to whoever contributed it (the app for a generic
// axis, an Uplink for its mod's own): neither this component nor the widget
// ever learns what a filter MEANS.
//
// Lives in core rather than ui-kit because it reads the aggregation store
// (ui-kit cannot depend on core); ui-kit keeps the dumb rendering half,
// `FilterBar`.
// ---------------------------------------------------------------------------

/**
 * This component's slot segment: the first half of every id it creates
 * (`filters.<rows>`). Its entry type is declared once, generically, as the
 * sdk's `SlotSegmentEntries<Row>["filters"]`; the cast in the body below is
 * the runtime half of that same claim.
 */
const FILTERS_SEGMENT = "filters";

export interface ContributedFiltersProps<
  R extends keyof ContributionRows & string,
> {
  /**
   * The sdk `ContributionRows` member naming this list's row contract. Both
   * the slot id's second half (`filters.<rows>`) and the compile-time tie
   * between the name and `items`: mis-name it and `items` stops
   * typechecking.
   */
  rows: R;
  /** The rows to filter. Must be the type the `rows` name declares. */
  items: readonly ContributionRows[R][];
  /** Receives the rows that pass the operator's current selection. */
  children: (filtered: readonly ContributionRows[R][]) => ReactNode;
  /** The FilterBar's show-all label, e.g. "All resources". */
  allLabel?: string;
}

export function ContributedFilters<R extends keyof ContributionRows & string>({
  rows,
  items,
  children,
  allLabel,
}: ContributedFiltersProps<R>): ReactElement {
  const { entries } = useSlotContributions<FilterEntry<ContributionRows[R]>>(
    FILTERS_SEGMENT,
    rows,
  );
  const filters = useFilterEngine<ContributionRows[R]>(entries);
  const filtered = filters.apply(items);

  return (
    <>
      <FilterBar
        groups={filters.groups}
        onChange={filters.onChange}
        allLabel={allLabel}
      />
      {children(filtered)}
    </>
  );
}
