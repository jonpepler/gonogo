import { useEffect, useId, useRef, useState } from "react";
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
 * renders each handle's delay UI through `CommandDelay` (`InFlightList` /
 * `ControlDelayStream`, chosen per `handle.shape`). Takes no prop: it is
 * context-collecting, so a command widget passes nothing.
 *
 * v3 shape: the visible surface is a 16px `<button>` strip (the drag-bar rail)
 * showing each command as a height-graph blip / sparkline. The strip sits in
 * normal flow at the true top of the scroller and publishes its measured height
 * into `--panel-rail-height` (the single ResizeObserver watches ONLY the strip,
 * never its content, so there is no measure-render-measure loop), the var the
 * sticky header rests below. Detail (labels, countdowns, the full stream) lives
 * in a tap-to-pin blur float that condenses out of the widget's top edge:
 *
 *   - hover on the strip opens the float as a PREVIEW (pointer devices)
 *   - focus opens the same preview, so a keyboard user can peek
 *   - activating the strip (click / Enter / Space, native `<button>`) PINS it
 *     open (`aria-pressed`); Esc or the float's close button unpins and returns
 *     focus to the strip
 *   - `aria-expanded` + `aria-controls` tie the strip to the float; the float is
 *     `inert` while closed so its controls never ghost into the tab order
 *
 * Renders `null` when no active handle has anything to draw, so a widget whose
 * commands are all instant or idle gets no rail element at all (its Panel DOM is
 * unchanged) and the panel reads the `var(--panel-rail-height, 0px)` fallback.
 */
export function PanelDelayRail() {
  const handles = useActiveHandles();
  const visible = handles.filter(handleHasContent);
  const hasContent = visible.length > 0;
  const railRef = useRef<HTMLButtonElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const targetRef = usePanelRailTarget();
  const [pinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const floatId = useId();
  const open = pinned || preview;

  // Toggle `inert` imperatively rather than via a prop: `inert` is a boolean DOM
  // attribute whose React typing varies across versions, and driving it from the
  // element keeps the closed float (and its close button) reliably out of the
  // tab order without depending on that typing.
  useEffect(() => {
    const el = floatRef.current;
    if (!el) return;
    if (open) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  }, [open]);

  // Re-run when the rail mounts / unmounts (hasContent flip). On mount it
  // observes the strip and publishes its height onto the target element (read
  // off the target ref, populated by commit time); on unmount it removes the
  // var so the panel falls back to 0px. hasContent is the mount/unmount TRIGGER
  // (the rail element appears / disappears with it), not a value read in the
  // body, which is exactly what the exhaustive-deps rule cannot see here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hasContent is the rail-mount/unmount trigger, not a body input
  useEffect(() => {
    const rail = railRef.current;
    const target = targetRef?.current;
    if (!rail || !target || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      // Read the strip's own measured height off the observer entry (never a
      // layout read of content), the one measurement this rail makes.
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

  // Close both preview and pin, returning focus to the strip so a keyboard user
  // lands back where they were (the APG disclosure pattern's focus-return).
  const closeToRail = () => {
    setPinned(false);
    setPreview(false);
    railRef.current?.focus();
  };

  return (
    <PanelDelayRail__Wrap
      onMouseEnter={() => setPreview(true)}
      onMouseLeave={() => {
        if (!pinned) setPreview(false);
      }}
      onBlur={(e) => {
        // Focus left the whole rail+float subtree: drop the preview (a pin
        // survives, it is dismissed only by Esc / the close button).
        if (
          !pinned &&
          !e.currentTarget.contains(e.relatedTarget as Node | null)
        )
          setPreview(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          closeToRail();
        }
      }}
    >
      <PanelDelayRail__Strip
        type="button"
        data-panel-rail=""
        ref={railRef}
        aria-pressed={pinned}
        aria-expanded={open}
        aria-controls={floatId}
        aria-label="Signal-delay detail; activate to pin it open"
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setPreview(true)}
      >
        {visible.map((h) => (
          <CommandDelay key={h.id} handle={h} variant="rail" />
        ))}
      </PanelDelayRail__Strip>
      <PanelDelayRail__Float
        id={floatId}
        ref={floatRef}
        data-delay-float=""
        data-open={open}
        data-pinned={pinned}
        aria-label="Signal-delay detail"
      >
        <PanelDelayRail__FloatHeader>
          <span>{pinned ? "PINNED" : "PREVIEW"}</span>
          <PanelDelayRail__Close
            type="button"
            aria-label="Close signal-delay detail"
            onClick={closeToRail}
          >
            ✕
          </PanelDelayRail__Close>
        </PanelDelayRail__FloatHeader>
        {visible.map((h) => (
          <CommandDelay
            key={h.id}
            handle={h}
            variant="inline"
            ariaLabel="Delay detail"
          />
        ))}
      </PanelDelayRail__Float>
    </PanelDelayRail__Wrap>
  );
}

/**
 * Positioning context for the float: the strip stays in normal flow (its 16px
 * is what `--panel-rail-height` publishes), the float is absolutely positioned
 * out of flow so opening it never moves the widget's content, it overlays the
 * top edge instead.
 */
const PanelDelayRail__Wrap = styled.div`
  position: relative;
`;

/**
 * v3 rail chrome: the 16px drag-bar strip is the whole delivery surface (the
 * gap doc's "16px transparent top-edge overlay", replacing the pre-v3 bare div
 * that grew to ~48px and pushed the header down by its content). A real
 * `<button>` for the tap-to-pin disclosure, reset to carry no button chrome:
 * transparent, height-capped at 16px with the overflow clipped, a flex row so a
 * widget's several in-flight indicators share the one strip. Coarse pointers get
 * a slightly taller strip for a reachable hit target.
 */
const PanelDelayRail__Strip = styled.button`
  appearance: none;
  border: 0;
  margin: 0;
  padding: 0;
  width: 100%;
  height: 16px;
  overflow: hidden;
  display: flex;
  align-items: stretch;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: -2px;
  }

  @media (pointer: coarse) {
    height: 20px;
  }
`;

/**
 * The detail float: condenses out of the widget's top edge directly under the
 * strip with a 14px backdrop blur, a background gradient heaviest at the top,
 * and a mask that dissolves the last 32px to nothing so it has no bottom border,
 * it just evaporates into the widget (v3 notes). Absolutely positioned, so it
 * overlays content and never reflows it. Hidden (and `inert` from the caller)
 * when closed.
 */
const PanelDelayRail__Float = styled.div`
  position: absolute;
  top: 16px;
  left: 0;
  right: 0;
  z-index: 3;
  padding: var(--space-8, 8px);
  padding-bottom: var(--space-32, 32px);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--color-surface-panel), transparent 12%),
    transparent
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    black calc(100% - 32px),
    transparent
  );
  mask-image: linear-gradient(to bottom, black calc(100% - 32px), transparent);

  &[data-open="false"] {
    display: none;
  }
`;

const PanelDelayRail__FloatHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-8, 8px);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  margin-bottom: var(--space-4, 4px);
`;

const PanelDelayRail__Close = styled.button`
  appearance: none;
  border: 0;
  padding: 0 var(--space-4, 4px);
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-accent-fg);
    outline-offset: 2px;
  }
`;
