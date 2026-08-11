import { FilterBar } from "@ksp-gonogo/ui-kit";
import type { ReactElement, ReactNode } from "react";
import { useFilterSelection } from "../contributedFilters";
import { useComponentContributions } from "../contributionsRuntime";

// ---------------------------------------------------------------------------
// The contributable-filters component (contribution-slots-spec §15), and the
// first COMPONENT-LED contribution slot: the component, not the hosting
// widget, owns the slot and reads its contributions.
//
// The widget's whole involvement is mounting this around its list:
//
//   <ContributedFilters items={units} allLabel="All resources">
//     {(filtered) => <MyRows rows={filtered} />}
//   </ContributedFilters>
//
// It writes no slot id, lists nothing in `contributionSlots`, calls no
// contribution hook, and renders no FilterBar: it only knows that what it
// gets back meets its own row contract. The slot id completes to
// `<widget-id>.filters` from WidgetMetaContext at mount (the same completion
// the automatic badges slot uses), because a reusable component cannot
// statically know its host: that completion is the one irreducible seam in
// the design.
//
// Contributors are entirely unaffected by who owns the slot: the same
// `registerContribution({ contributes: "<widget-id>.filters", ... })` that
// feeds a widget-led slot feeds this one, typed through the same
// `ContributionRegistry` line the widget declares as its contract (and the
// codegen mirrors onto the sdk leaf for facade-sealed Uplinks).
// ---------------------------------------------------------------------------

export interface ContributedFiltersProps<T> {
  /** The host's rows, filtered through whatever facets arrived. */
  items: readonly T[];
  /** Renders the rows that pass the operator's current selection. */
  children: (filtered: readonly T[]) => ReactNode;
  /** Show-all label for a single-select axis, e.g. "All resources". */
  allLabel?: string;
  /**
   * Second segment of the slot id; the widget id supplies the first. The
   * default covers the one-filter-bar-per-widget case; override it only when
   * one widget mounts two INDEPENDENT filter bars (each override needs its
   * own `ContributionRegistry` contract line, like any slot).
   */
  segment?: string;
}

/**
 * A contribution-fed filter bar over the host's own rows. Renders nothing
 * visible until something contributes a facet, and renders `children(items)`
 * unfiltered when mounted outside a widget (no WidgetMetaContext: no slot).
 */
export function ContributedFilters<T>({
  items,
  children,
  allLabel,
  segment = "filters",
}: ContributedFiltersProps<T>): ReactElement {
  const entries = useComponentContributions(segment);
  const filters = useFilterSelection<T>(entries);

  return (
    <>
      {filters.groups.length > 0 && (
        <FilterBar
          groups={filters.groups}
          onChange={filters.onChange}
          allLabel={allLabel}
        />
      )}
      {children(filters.apply(items))}
    </>
  );
}
