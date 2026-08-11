// Stands for ui-kit's `FilterBar`, which is UNCHANGED by this design: purely
// presentational, handed already-grouped axes, reports selections back. This
// trim renders every group as toggle chips (the real one also has the
// single-select dropdown form).
import type { ReactElement } from "react";
import type {
  ContributedFilterGroup,
  ContributedFilters,
} from "../core/contributedFilters";

function ChipGroup({
  group,
  onChange,
}: Readonly<{
  group: ContributedFilterGroup;
  onChange: ContributedFilters<unknown>["onChange"];
}>) {
  const toggle = (optionId: string) => {
    const next = group.options
      .filter((option) =>
        option.id === optionId ? !option.active : option.active,
      )
      .map((option) => option.id);
    onChange(group.id, next);
  };

  return (
    <fieldset aria-label={group.label ?? "Filters"}>
      {group.options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.active}
          onClick={() => toggle(option.id)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

export function FilterBarLite({
  groups,
  onChange,
}: Readonly<{
  groups: readonly ContributedFilterGroup[];
  onChange: ContributedFilters<unknown>["onChange"];
}>): ReactElement | null {
  const shown = groups.filter((group) => group.options.length > 0);
  if (shown.length === 0) return null;
  return (
    <div>
      {shown.map((group) => (
        <ChipGroup key={group.id} group={group} onChange={onChange} />
      ))}
    </div>
  );
}
