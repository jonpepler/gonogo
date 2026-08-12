import { type ReactNode, useId, useState } from "react";
import { Cluster } from "./Cluster";
import { useContributions } from "./contributionsRead";
import { EmptyState } from "./EmptyState";
import { FilterChip } from "./FilterChip";
import { Field, FieldLabel, Input } from "./Form";
import { type SpaceToken, Stack } from "./Stack";

// FilterList owns its `filters` slot: a provider contributes pre-filled
// SEARCH TERMS (plain strings) via `registerContribution`, and this shows
// them as toggle chips. Co-located declaration-merge so the slot travels
// with the component that renders it, rather than sitting in a shared file.
declare module "./contributions" {
  interface ComponentSlotRegistry {
    filters: string;
  }
}

export interface FilterRow {
  /** Stable React key for the row. */
  id: string;
  /** The text this row is matched against, baked by the widget from its own
   *  fields. What goes in here is the widget's entire say over searchability. */
  searchText: string;
  /** The already-rendered row. */
  node: ReactNode;
}

export interface FilterListProps {
  rows: readonly FilterRow[];
  /** Shown when a filter is active but matches nothing. */
  emptyLabel?: ReactNode;
  /**
   * Gap between rendered rows, snapped to the space scale. Defaults to `xs`,
   * the original tight-list spacing. A widget whose rows are their own cards
   * (rather than plain list lines) wants more separation between them, e.g.
   * `md`, so neighbouring cards read as distinct records rather than a fused
   * block.
   */
  rowGap?: SpaceToken;
  /**
   * Size of the contributed filter chips. Defaults to `md`, the original
   * chip size, so existing FilterList consumers are unaffected. A widget
   * whose header is already dense (e.g. ResourceOps's stats + search + chips
   * stack) wants `sm`.
   */
  chipSize?: "md" | "sm";
}

/**
 * A row list already pre-processed by the widget (`searchText` baked, `node`
 * rendered), filtered by a free-text search box ANDed with any toggled chips
 * contributed to this component's `filters` slot. Toggles stack with each
 * other; every needle is a case-insensitive substring match. Nothing
 * selected and nothing typed shows every row.
 *
 * Mounted outside a widget context (bare mount, probe, test with no meta)
 * `useContributions` resolves no widget id to complete against, so the term
 * list is stably empty and every row passes through.
 */
export function FilterList({
  rows,
  emptyLabel = "Nothing matches the filter",
  rowGap = "xs",
  chipSize = "md",
}: FilterListProps) {
  const terms = useContributions("filters");
  // Distinct terms, in contribution order: two providers can land the same
  // word, and a doubled toggle is just noise.
  const uniqueTerms = [...new Set(terms)];

  const [active, setActive] = useState<ReadonlySet<string>>(() => new Set());
  const [typed, setTyped] = useState("");
  const searchId = useId();

  const toggle = (term: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(term)) next.delete(term);
      else next.add(term);
      return next;
    });
  };

  // Toggles stack, the typed box is ANDed on top and applied last. Empty
  // needles are dropped so the resting state passes everything through.
  const needles = [...active, typed]
    .filter((s) => s.length > 0)
    .map((s) => s.toLowerCase());
  const shown = rows.filter((row) => {
    const haystack = row.searchText.toLowerCase();
    return needles.every((needle) => haystack.includes(needle));
  });

  return (
    // The outer gap ("xl") sits between the search+chips group and the row
    // list below it, exactly double the inner gap ("md") between the search
    // box and the chip row: at xs/sm the two gaps read as the same margin,
    // which is the bug this pair fixes. The three list zones (search, chips,
    // rows) now read as increasingly separated, not a single fused block.
    <Stack gap="xl">
      <Stack gap="md">
        <Field>
          <FieldLabel htmlFor={searchId}>Search</FieldLabel>
          <Input
            id={searchId}
            type="search"
            value={typed}
            placeholder="Filter…"
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>

        {uniqueTerms.length > 0 && (
          <Cluster
            justify="start"
            gap="xs"
            wrap
            role="group"
            aria-label="Filters"
          >
            {uniqueTerms.map((term) => (
              <FilterChip
                key={term}
                label={term}
                selected={active.has(term)}
                onToggle={() => toggle(term)}
                size={chipSize}
              />
            ))}
          </Cluster>
        )}
      </Stack>

      {shown.length > 0 ? (
        <Stack gap={rowGap}>
          {shown.map((row) => (
            <div key={row.id}>{row.node}</div>
          ))}
        </Stack>
      ) : (
        <EmptyState>{emptyLabel}</EmptyState>
      )}
    </Stack>
  );
}
