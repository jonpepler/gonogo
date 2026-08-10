import { type ReactNode, useId, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { ChevronRightIcon } from "./Icons";

export interface DisclosureProps {
  /**
   * The always-visible trigger content (text, a glyph, a badge). Pass a
   * function of `open` when the label itself should read differently once
   * expanded (e.g. "Show detail" → "Hide detail").
   */
  label: ReactNode | ((open: boolean) => ReactNode);
  /** The panel content, revealed when open. */
  children: ReactNode;
  /**
   * Accessible name for the trigger. Required when `label` is a non-text node
   * (an icon/glyph) so the button is not unlabelled to a screen reader.
   */
  ariaLabel?: string;
  className?: string;
  /**
   * "popover" (default): the panel pops out, absolutely positioned over
   * whatever follows, sized to its own content, for a compact hint next to a
   * tight trigger (FleetRoster's per-row signal cell).
   * "inline": the panel expands IN FLOW below the trigger, full width,
   * pushing later content down rather than covering it, the accordion shape
   * a resource-row ledger needs. By default the trigger also grows a
   * rotating chevron so the control reads unambiguously as an expander (set
   * `chevron={false}` when `label` is itself a right-aligned, worded control
   * like "Show detail" and a second glyph would be redundant). Long panels
   * scroll inside a capped-height block instead of overflowing the row.
   */
  variant?: "popover" | "inline";
  /**
   * Whether the rotating chevron renders for `variant="inline"`. Defaults to
   * `true`. Set `false` when `label` already reads as the affordance (e.g.
   * "Show detail"): the trigger then right-aligns that label to where the
   * chevron would have sat, rather than showing both. Ignored for
   * `variant="popover"`, which never has a chevron.
   */
  chevron?: boolean;
}

/**
 * A minimal accessible disclosure: a real `<button aria-expanded>` that toggles a
 * panel, keyboard AND pointer reachable (click / Enter / Space to open, Escape to
 * close returning focus to the trigger), with a visible focus ring. The one
 * general-purpose focus/tap detail surface in the kit, deliberately NOT the
 * hover-only reveal `ControlDelayStream` uses (unreachable without a mouse). Use
 * it wherever a compact control needs to expand detail on demand: `popover`
 * (the default) for a tooltip-shaped hint, `inline` for a true accordion row.
 */
export function Disclosure({
  label,
  children,
  ariaLabel,
  className,
  variant = "popover",
  chevron = true,
}: DisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const showChevron = variant === "inline" && chevron;
  const resolvedLabel = typeof label === "function" ? label(open) : label;

  return (
    <Disclosure__Root
      className={className}
      $variant={variant}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <Disclosure__Trigger
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        $variant={variant}
        $align={variant === "inline" && !chevron ? "end" : "between"}
      >
        {resolvedLabel}
        {showChevron && (
          <Disclosure__Chevron $open={open}>
            <ChevronRightIcon size={14} />
          </Disclosure__Chevron>
        )}
      </Disclosure__Trigger>
      {open && (
        <Disclosure__Panel id={panelId} role="group" $variant={variant}>
          {children}
        </Disclosure__Panel>
      )}
    </Disclosure__Root>
  );
}

const Disclosure__Root = styled.div<{ $variant: "popover" | "inline" }>`
  position: relative;
  display: ${({ $variant }) => ($variant === "inline" ? "flex" : "inline-flex")};
  flex-direction: column;
  width: ${({ $variant }) => ($variant === "inline" ? "100%" : "auto")};
`;

const Disclosure__Trigger = styled.button<{
  $variant: "popover" | "inline";
  $align: "between" | "end";
}>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  ${({ $variant, $align }) =>
    $variant === "inline" &&
    css`
      justify-content: ${$align === "end" ? "flex-end" : "space-between"};
      width: 100%;
      border-radius: var(--radius-sm);
      &:hover {
        background: var(--color-surface-sunken);
      }
    `}
  &:focus-visible {
    outline: 2px solid var(--color-focus);
    outline-offset: 2px;
  }
`;

const Disclosure__Chevron = styled.span<{ $open: boolean }>`
  display: inline-flex;
  flex-shrink: 0;
  @media (prefers-reduced-motion: no-preference) {
    transition: transform var(--duration-base, 150ms) var(--ease-standard, ease);
  }
  transform: rotate(${({ $open }) => ($open ? 90 : 0)}deg);
`;

const Disclosure__Panel = styled.div<{ $variant: "popover" | "inline" }>`
  ${({ $variant }) =>
    $variant === "popover"
      ? css`
          position: absolute;
          top: 100%;
          right: 0;
          /* Local sibling ordering inside this component's own stacking context:
             lift the popped panel above following content (e.g. later rows). Not
             app-global chrome, so a named z rung would wrongly outrank the
             dashboard's. */
          z-index: 1;
          margin-top: var(--space-2);
        `
      : css`
          position: static;
          width: 100%;
          margin-top: var(--space-2);
          /* An accordion body must never overlay or overflow the row below it:
             it grows in flow up to a cap, then scrolls its own content rather
             than spilling past the row's edge. */
          max-height: 16rem;
          overflow-y: auto;
        `}
  padding: var(--space-6) var(--space-8);
  background: var(--color-surface-panel);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md);
`;
