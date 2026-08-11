// ---------------------------------------------------------------------------
// Stands for `packages/core/src/contributedFilters.ts`: the smart half of
// ui-kit's presentational `FilterBar`, and the worked example of a slot kind.
//
// WHAT CHANGES vs the real file:
//   - the module declares its kind at load (`registerSlotKind`), the
//     render-free registration in the spirit of registerComponent
//   - `useContributedFilters()` gains the ZERO-ARG component-led overloads:
//     no argument (slot key = the kind, `<widget>.filters`) or `{ as }` (a
//     qualified key for multi-mount). The existing explicit-slot-id overload
//     stays for layer 1 and is untouched
//
// The grouping / selection / apply logic below is the real file's, trimmed
// (live-facet pruning and memo details dropped where irrelevant).
// ---------------------------------------------------------------------------

import { useCallback, useMemo, useState } from "react";
import type { FilterEntry, FilterSelection } from "../sdk";
import { registerSlotKind } from "./componentSlots";
import type { ContributionEntry, ContributionSlotId } from "./contributions";
import {
  type ComponentSlotOptions,
  useComponentSlot,
  useContributionsBySlotId,
} from "./contributionsRuntime";

registerSlotKind({
  kind: "filters",
  name: "List filters",
  description:
    "Contributed facet axes over the host widget's rows; the host applies them, contributors own the taxonomy",
});

export interface ContributedFilterOption {
  id: string;
  label: string;
  active: boolean;
}

export interface ContributedFilterGroup {
  id: string;
  label?: string;
  selection: FilterSelection;
  options: readonly ContributedFilterOption[];
}

export interface ContributedFilters<T> {
  groups: readonly ContributedFilterGroup[];
  onChange: (groupId: string, selectedOptionIds: readonly string[]) => void;
  apply: (items: readonly T[]) => readonly T[];
  activeCount: number;
}

type FilterItem<S extends string> =
  ContributionEntry<S> extends FilterEntry<infer T> ? T : unknown;

// Component-led: slot key defaults to the kind, `<widget>.filters`.
export function useContributedFilters<Row>(): ContributedFilters<Row>;
// Component-led, qualified key for a widget hosting more than one bar.
export function useContributedFilters<Row>(
  opts: ComponentSlotOptions<"filters">,
): ContributedFilters<Row>;
// Widget-led (layer 1), the existing signature, unchanged.
export function useContributedFilters<S extends ContributionSlotId>(
  slot: S,
): ContributedFilters<FilterItem<S>>;
export function useContributedFilters(
  arg?: string | ComponentSlotOptions<"filters">,
): ContributedFilters<unknown> {
  const explicitSlot = typeof arg === "string" ? arg : null;
  const opts = typeof arg === "object" ? arg : undefined;

  // Both paths run both hooks so the hook order never depends on the
  // overload used; the unused one is inert (the component slot is disabled
  // for an explicit slot, whose aggregation the widget's declared list
  // already carries).
  const componentSlot = useComponentSlot("filters", {
    ...opts,
    enabled: explicitSlot === null,
  });
  const explicitEntries = useContributionsBySlotId(explicitSlot);
  const entries =
    explicitSlot !== null ? explicitEntries : componentSlot.entries;

  const [selected, setSelected] = useState<Record<string, readonly string[]>>(
    {},
  );

  const resolved = useMemo(() => {
    const options: {
      optionId: string;
      groupId: string;
      predicate: (item: unknown) => boolean;
    }[] = [];
    const groups: ContributedFilterGroup[] = [];
    const byGroupId = new Map<string, ContributedFilterGroup>();

    for (const raw of entries) {
      const entry = raw as unknown as FilterEntry<unknown> & {
        contributionId: string;
      };
      if (typeof entry?.predicate !== "function") continue;

      const groupId = entry.group ?? `${entry.contributionId}:${entry.id}`;
      const optionId = `${entry.contributionId}:${entry.id}`;

      let group = byGroupId.get(groupId);
      if (!group) {
        group = {
          id: groupId,
          label: entry.groupLabel,
          selection: entry.selection ?? "multi",
          options: [],
        };
        byGroupId.set(groupId, group);
        groups.push(group);
      }

      (group.options as ContributedFilterOption[]).push({
        id: optionId,
        label: entry.label,
        active: false,
      });
      options.push({
        optionId,
        groupId,
        predicate: entry.predicate as (item: unknown) => boolean,
      });
    }

    return { groups, options };
  }, [entries]);

  const live = useMemo(() => {
    const present = new Set(resolved.options.map((o) => o.optionId));
    const out = new Map<string, Set<string>>();
    for (const group of resolved.groups) {
      const picked = (selected[group.id] ?? []).filter((id) => present.has(id));
      if (picked.length > 0) out.set(group.id, new Set(picked));
    }
    return out;
  }, [resolved, selected]);

  const groups = useMemo(
    () =>
      resolved.groups.map((group) => ({
        ...group,
        options: group.options.map((option) => ({
          ...option,
          active: live.get(group.id)?.has(option.id) === true,
        })),
      })),
    [resolved.groups, live],
  );

  const onChange = useCallback(
    (groupId: string, selectedOptionIds: readonly string[]) => {
      setSelected((prev) => ({ ...prev, [groupId]: [...selectedOptionIds] }));
    },
    [],
  );

  const apply = useCallback(
    (items: readonly unknown[]): readonly unknown[] => {
      if (live.size === 0) return items;
      const predicatesByGroup = new Map<
        string,
        ((item: unknown) => boolean)[]
      >();
      for (const option of resolved.options) {
        if (live.get(option.groupId)?.has(option.optionId) !== true) continue;
        const list = predicatesByGroup.get(option.groupId) ?? [];
        list.push(option.predicate);
        predicatesByGroup.set(option.groupId, list);
      }
      if (predicatesByGroup.size === 0) return items;

      return items.filter((item) => {
        for (const predicates of predicatesByGroup.values()) {
          if (!predicates.some((predicate) => predicate(item))) return false;
        }
        return true;
      });
    },
    [live, resolved.options],
  );

  const activeCount = useMemo(() => {
    let count = 0;
    for (const picked of live.values()) count += picked.size;
    return count;
  }, [live]);

  return { groups, onChange, apply, activeCount };
}
