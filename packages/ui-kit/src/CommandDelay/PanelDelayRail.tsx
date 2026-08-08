import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { CommandDelay } from "./CommandDelay";
import { type CommandHandle, useActiveHandles } from "./DelayRailContext";
import { usePanelRailTarget } from "./PanelRailTarget";

/**
 * Whether a handle's `CommandDelay` would draw anything: a stream with real
 * delay, or a discrete handle with in-flight rows. Mirrors `CommandDelay`'s own
 * null-decision so the rail shows a handle iff its `CommandDelay` renders. An
 * instant / idle command (a meta-vantage or not-yet-dispatched handle) is still
 * registered, so its must-consume token is marked and it appears the instant it
 * goes in flight, but it contributes no rail chrome meanwhile.
 */
function handleHasContent(handle: CommandHandle): boolean {
  if (handle.shape === "stream") return handle.effectiveDelaySeconds > 0;
  return handle.inFlight.length > 0;
}

/**
 * The Panel-owned signal-delay rail. Reads the active command handles from the
 * nearest `DelayRailContext` (populated by `usePanelDelay` in the widget) and
 * renders each handle's delay UI through `CommandDelay`. Takes no prop: it is
 * context-collecting, so a command widget passes nothing.
 *
 * v3/v4 shape: the rail is a single `<button>` sitting flush at the true top
 * edge, spanning the full widget width, in normal flow above the Panel title.
 * Collapsed it is the 16px drag-bar strip (grazing glows for discrete commands,
 * a mini sparkline for a stream); with several commands in flight their
 * summaries overlay in that one band. Activating it (click / Enter / Space,
 * native `<button>`; Esc collapses) PINS it, and pinning GROWS the rail in real
 * layout space: each command switches to its fuller `inline` view (the discrete
 * list, the full-height stream graph with its labels back), the button's height
 * grows, and because that measured height feeds `--panel-rail-height`, the Panel
 * title and body are pushed DOWN. It never overlays anything, it takes space.
 * `aria-pressed` / `aria-expanded` carry the state.
 *
 * Renders `null` when no active handle has anything to draw, so a widget whose
 * commands are all instant or idle gets no rail element at all and the panel
 * reads the `var(--panel-rail-height, 0px)` fallback.
 */
export function PanelDelayRail() {
  const handles = useActiveHandles();
  const visible = handles.filter(handleHasContent);
  const hasContent = visible.length > 0;
  const railRef = useRef<HTMLButtonElement>(null);
  const targetRef = usePanelRailTarget();
  const [pinned, setPinned] = useState(false);

  // Re-run when the rail mounts / unmounts (hasContent flip). On mount it
  // observes the rail and publishes its height onto the target element; on
  // unmount it removes the var so the panel falls back to 0px. The single
  // ResizeObserver watches ONLY the rail element, so a pin GROWING the rail
  // republishes the taller height (pushing the header + body down) with no
  // measure-render-measure loop. hasContent is the mount/unmount TRIGGER, not a
  // value read in the body, which the exhaustive-deps rule cannot see.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent is the rail-mount/unmount trigger, not a body input
  useEffect(() => {
    const rail = railRef.current;
    const target = targetRef?.current;
    if (!rail || !target || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const height = entries[entries.length - 1]?.contentRect.height ?? 0;
      target.style.setProperty("--panel-rail-height", `${height}px`);
    });
    ro.observe(rail);
    return () => {
      ro.disconnect();
      target.style.removeProperty("--panel-rail-height");
    };
  }, [hasContent, targetRef]);

  if (!hasContent) return null;

  // Stream(s) on top, discrete underneath (operator's v3 ordering): a stable
  // partition, streams keep their order, discrete keep theirs.
  const ordered = [
    ...visible.filter((h) => h.shape === "stream"),
    ...visible.filter((h) => h.shape !== "stream"),
  ];

  return (
    <PanelDelayRail__Rail
      type="button"
      data-panel-rail=""
      ref={railRef}
      data-pinned={pinned}
      aria-pressed={pinned}
      aria-expanded={pinned}
      aria-label={
        pinned
          ? "Signal-delay detail; activate to collapse"
          : "Signal-delay detail; activate to expand it in place"
      }
      onClick={() => setPinned((p) => !p)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && pinned) {
          e.stopPropagation();
          setPinned(false);
        }
      }}
    >
      {ordered.map((h) => (
        <CommandDelay
          key={h.id}
          handle={h}
          variant={pinned ? "expanded" : "rail"}
          ariaLabel={pinned ? "Delay detail" : undefined}
        />
      ))}
    </PanelDelayRail__Rail>
  );
}

/**
 * The rail button. Flush to the true top-left-right edges (cancels the body's
 * own top + side inset, so it sits at the very top with no dead band above it
 * and spans the full width; the sticky header's offset accounts for the flush
 * rail, see PanelStickyHeader). A real `<button>` for the pin disclosure, reset
 * to carry no button chrome.
 *
 * Collapsed: a 16px band, all handles OVERLAID (grid, every child in the one
 * cell) so several grazing glows + a mini sparkline share the top edge rather
 * than crowd. Pinned: grows: a flex column that stacks each command's fuller
 * `inline` view and lets the button's height expand into real layout space
 * (overflow visible, auto height), which republishes `--panel-rail-height` and
 * pushes the title + body down. Coarse pointers get a taller collapsed strip.
 */
const PanelDelayRail__Rail = styled.button`
  appearance: none;
  border: 0;
  /* Never let the scroller's flex layout shrink the grown rail below its content
     (that would clip the lower stacked commands under overflow:hidden): the rail
     takes its full height and the body scrolls under it. */
  flex: 0 0 auto;
  margin: calc(-1 * var(--space-8, 8px)) calc(-1 * var(--space-16, 16px)) 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: inherit;

  /* Collapsed: one 16px band, children stacked in a single grid cell. Height is
     capped by max-height so pinning can animate it open (auto is not
     animatable): the element's height follows min(content, max-height), so
     growing the cap grows the rail smoothly and shrinking it collapses it. */
  display: grid;
  height: auto;
  max-height: 16px;
  overflow: hidden;
  transition: max-height var(--duration-slow, 200ms) var(--ease-standard, ease);

  & > * {
    grid-area: 1 / 1;
  }

  @media (pointer: coarse) {
    max-height: 20px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  &:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -2px;
  }

  &[data-pinned="true"] {
    display: flex;
    flex-direction: column;
    gap: var(--space-8, 8px);
    /* Generous cap the grown content fits inside; the visible height settles at
       the content height, the extra headroom is never seen. */
    max-height: 800px;
    padding: var(--space-4, 4px) var(--space-16, 16px) var(--space-8, 8px);

    & > * {
      grid-area: auto;
    }
  }
`;
