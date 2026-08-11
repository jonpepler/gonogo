import { FilterBar } from "@ksp-gonogo/ui-kit";
import type { ReactElement, ReactNode } from "react";
import { useContributedFiltersBySlotId } from "../contributedFilters";
import { useWidgetSlotId } from "../hooks/useWidgetSlotId";

// ---------------------------------------------------------------------------
// The slot-owning filter component: the whole extension surface of a
// filterable list, owned by the component so the host widget never touches
// the contribution system.
//
// The widget wraps its list rendering in this and is done:
//
//   <ContributedFilters items={units} allLabel="All resources">
//     {(filtered) => <MyRows rows={filtered} />}
//   </ContributedFilters>
//
// This component mints its slot id from the host widget's identity
// (`<componentId>.filters`, see `useWidgetSlotId`), reads whatever filters
// have been contributed to it, renders the control (`FilterBar`, which
// renders nothing while no facets exist), and hands the host back exactly
// the rows that pass. The widget only ever sees data that meets its own
// contract; contributors only ever see the ordinary contributions registry.
// Aggregation is automatic (contributor-driven, see `ContributionsProvider`),
// so there is nothing to declare on `registerComponent` either.
//
// Outside a widget (a bare test, a panel outside the dashboard) the slot id
// is null and the component degrades to a pass-through: all items, no bar.
// ---------------------------------------------------------------------------

export interface ContributedFiltersProps<T> {
  /** The host's rows, pre-filter. Contributed predicates run against these. */
  items: readonly T[];
  /** Renders the rows that pass the operator's current selection. */
  children: (filtered: readonly T[]) => ReactNode;
  /** Label for a single-select group's show-everything option. */
  allLabel?: string;
  /**
   * Second segment of the slot id, completed to `<componentId>.<segment>` at
   * mount. Default "filters". Override ONLY when one widget mounts two
   * independently-filtered lists; the override lands in the contributor-facing
   * slot id, where it reads as documentation of which list it feeds.
   */
  segment?: string;
}

export function ContributedFilters<T>({
  items,
  children,
  allLabel,
  segment = "filters",
}: ContributedFiltersProps<T>): ReactElement {
  const slot = useWidgetSlotId(segment);
  const filters = useContributedFiltersBySlotId<T>(slot ?? "");
  return (
    <>
      <FilterBar
        groups={filters.groups}
        onChange={filters.onChange}
        allLabel={allLabel}
      />
      {children(filters.apply(items))}
    </>
  );
}
