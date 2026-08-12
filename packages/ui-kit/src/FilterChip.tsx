import styled from "styled-components";

export interface FilterChipProps {
  label: string;
  selected: boolean;
  count?: number;
  onToggle: () => void;
  /**
   * Visual size. Defaults to `md`, the original size, so existing chip
   * consumers (MissionProfiles scene bindings, ComponentOverlay tag filters)
   * are unaffected. `sm` is a tighter pill for a dense filter row, e.g.
   * ResourceOps's process list, where the default size crowds the header.
   */
  size?: "md" | "sm";
}

export function FilterChip({
  label,
  selected,
  count,
  onToggle,
  size = "md",
}: FilterChipProps) {
  return (
    <ChipButton
      type="button"
      $selected={selected}
      $size={size}
      onClick={onToggle}
      aria-pressed={selected}
    >
      <span>{label}</span>
      {count !== undefined && <Count>{count}</Count>}
    </ChipButton>
  );
}

const ChipButton = styled.button<{ $selected: boolean; $size: "md" | "sm" }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ $size }) => ($size === "sm" ? "var(--space-4)" : "var(--space-6)")};
  padding: ${({ $size }) =>
    $size === "sm"
      ? "var(--space-hair) var(--space-6)"
      : "var(--space-2) var(--space-8)"};
  /* Stadium, not a corner: with 2px vertical padding the old 12px already
     exceeded half the rendered height. --radius-pill renders identically and
     survives a padding change. */
  border-radius: var(--radius-pill);
  font-size: ${({ $size }) =>
    $size === "sm" ? "var(--font-size-2xs)" : "var(--font-size-xs)"};
  /* Regular weight: this label renders in the app's monospace body font,
     where a bold weight over-tracks uppercase text and reads badly at this
     size. */
  font-weight: 400;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition:
    background var(--duration-fast),
    border-color var(--duration-fast),
    color var(--duration-fast);

  background: ${({ $selected }) =>
    $selected ? "var(--color-accent-fg)" : "transparent"};
  color: ${({ $selected }) =>
    $selected ? "var(--color-text-inverse)" : "var(--color-text-dim)"};
  border: 1px solid
    ${({ $selected }) =>
      $selected ? "var(--color-accent-fg)" : "var(--color-border-subtle)"};

  &:hover {
    border-color: var(--color-accent-fg);
    color: ${({ $selected }) =>
      $selected ? "var(--color-text-inverse)" : "var(--color-text-primary)"};
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: 2px;
  }
`;

const Count = styled.span`
  font-variant-numeric: tabular-nums;
  font-size: var(--font-size-2xs);
  letter-spacing: 0;
  opacity: 0.75;
`;
