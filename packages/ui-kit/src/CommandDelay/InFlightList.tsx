import { type RefObject, useEffect, useId, useRef, useState } from "react";
import styled, { css } from "styled-components";
import { formatCountdown } from "../formatDuration";
import { useElementSize } from "../useElementSize";

/**
 * Vanilla-safe display shape for one delayed command, a deliberate LOCAL
 * redeclaration, not an import of `@ksp-gonogo/sitrep-client`'s
 * `InFlightCommand`: this package carries no data hooks and no gonogo-type
 * imports (design: "InFlightList"/"CommandGroup" stay props-driven only).
 * `etaSeconds` is the caller's choice of which clock to show (reach vs.
 * reply): `null` renders as "no ETA" (e.g. an already-`overdue`/`lost`
 * entry, or a `no-path` mode with nothing to count toward).
 */
export interface InFlightListItem {
  id: string;
  label: string;
  etaSeconds: number | null;
  phase: "in-transit" | "awaiting-reply" | "due" | "overdue" | "lost";
  /**
   * True position along the 3-stage delay axis, 0 (just sent) .. 1 (end of the
   * 3T span), from the command's reach/reply geometry (`journeyProgress` in
   * `toInFlightListItems`). Only the `variant="rail"` glow reads it; the inline
   * list ignores it. Optional so a hand-built item (tests, non-`useCommand`
   * sources) need not supply it, the glow then anchors by phase.
   */
  progress?: number;
}

export type InFlightListMode = "live" | "staged" | "no-path";

/**
 * How much room the list gets to say what it knows. Orthogonal to `mode`,
 * which is about WHAT is being counted; this is about how much space there is
 * to count it in.
 *
 *   - `full`    arrow, label and countdown per command, one per line.
 *   - `compact` arrow and countdown only. The label moves to the row's
 *               accessible name and its tooltip, because at this size a label
 *               would truncate to two characters and tell nobody anything.
 *   - `badge`   one chip for the whole set: count plus the nearest arrival.
 *
 * `auto` (the default) measures the rendered width and picks. Widgets are
 * small and shrink further, and a caller passing this by hand is one more
 * thing twenty call sites can get wrong, so the component decides from the
 * room it actually has rather than from what the caller guessed.
 */
export type InFlightListDensity = "auto" | "full" | "compact" | "badge";

export interface InFlightListProps {
  items: InFlightListItem[];
  mode?: InFlightListMode;
  density?: InFlightListDensity;
  /**
   * `column` stacks the entries, `row` flows them. A queue under a button
   * group wants a column; one beside an action row wants a row. Row wraps, so
   * it degrades to several short lines rather than overflowing.
   */
  orientation?: "column" | "row";
  /** Accessible label for the list region. Defaults to "In-flight commands". */
  ariaLabel?: string;
  /**
   * `"inline"` (default) is the monospace row/badge list every existing
   * consumer gets. `"rail"` is the v3 16px strip the Panel rail uses: each
   * in-flight command is a soft glow grazing the top edge (its blip sits off the
   * widget, above the edge, only the blur reaches down), positioned by true
   * journey progress so it sweeps left -> right as the command travels the 3
   * signal stages. `"expanded"` is the grown/pinned detail: a rich pill per
   * command (label, phase, countdown, and a leg-coloured progress bar tracking
   * its journey). `mode` / `density` / `orientation` apply to `"inline"` only.
   */
  variant?: "inline" | "rail" | "expanded";
}

const PHASE_ARROW: Record<InFlightListItem["phase"], string> = {
  "in-transit": "↑",
  "awaiting-reply": "↓",
  due: "↓",
  overdue: "!",
  lost: "✕",
};

const ERROR_PHASES = new Set<InFlightListItem["phase"]>(["overdue", "lost"]);

/**
 * Width thresholds for `auto`, in px, comment-locked to what the content
 * needs rather than to a device size.
 *
 * `full` needs an arrow (~10px), a countdown (~48px at the monospace xs
 * size), the 6px gaps and the 16px of horizontal padding, plus enough left
 * over for a label to be worth printing. Below ~100px of label room it
 * ellipsises to noise, so 180 is the floor.
 *
 * `compact` needs only arrow plus countdown, about 80px with padding. Below
 * that even one entry does not fit on a line, so the whole set collapses to
 * the badge.
 */
const FULL_MIN_WIDTH = 180;
const COMPACT_MIN_WIDTH = 96;

/** Phase ranking for the badge's summary: the nearest real arrival wins. */
function nearestEta(items: InFlightListItem[]): number | null {
  let best: number | null = null;
  for (const item of items) {
    if (item.etaSeconds === null) continue;
    if (best === null || item.etaSeconds < best) best = item.etaSeconds;
  }
  return best;
}

/** Re-seed the local countdown only on a jump this large (seconds), the
 * caller's own `etaSeconds` reads (e.g. `useCommand`'s synchronous
 * `nowUt`) drift by fractions of a second on every unrelated re-render;
 * resyncing on every one of those would fight the local tick below and
 * tear its interval down constantly instead of letting it run. */
const RESYNC_THRESHOLD_SECONDS = 1;

/**
 * A pure, local-ticking countdown value: seeds from `etaSeconds`, resyncs
 * only on a real jump (a fresh dispatch, a phase transition), and otherwise
 * decrements once per second on its OWN mount-once interval, so the
 * displayed number stays smooth even when the caller only recomputes
 * `etaSeconds` on a slower (or noisier) cadence. Pure in the sense the
 * design calls for: it operates ONLY on the value passed in, no data
 * source, no clock import.
 */
export function useCountdown(etaSeconds: number | null): number | null {
  const [value, setValue] = useState(etaSeconds);
  const lastSeedRef = useRef(etaSeconds);

  useEffect(() => {
    const last = lastSeedRef.current;
    const jumped =
      (last === null) !== (etaSeconds === null) ||
      (last !== null &&
        etaSeconds !== null &&
        Math.abs(etaSeconds - last) >= RESYNC_THRESHOLD_SECONDS);
    if (jumped) {
      lastSeedRef.current = etaSeconds;
      setValue(etaSeconds);
    }
  }, [etaSeconds]);

  // Mount-once local tick: deliberately NOT keyed on `etaSeconds` (see
  // `RESYNC_THRESHOLD_SECONDS`'s doc): tying this interval's lifetime to a
  // value that drifts on every render would tear it down and recreate it
  // constantly instead of ever letting a full second elapse.
  useEffect(() => {
    const id = setInterval(() => {
      setValue((prev) => (prev === null ? null : Math.max(0, prev - 1)));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return value;
}

/**
 * Presentational set-renderer for `InFlightCommand`-shaped items (0/1/N):
 * a stack of in-flight rows with per-entry countdowns and phase-appropriate
 * styling. Renders nothing for an empty set. No data hooks, a widget feeds
 * it `useCommand().inFlight` or `useRouteCommands(topic).items` directly.
 */
export function InFlightList({
  items,
  mode,
  density = "auto",
  orientation = "column",
  ariaLabel = "In-flight commands",
  variant = "inline",
}: InFlightListProps) {
  // Seeded wide so the first paint is the full form and `auto` only ever
  // shrinks from it. Seeding narrow would flash a badge on every mount.
  const { ref, size } = useElementSize({ w: 320, h: 0 });

  // v3 rail / expanded renderings bypass the density/badge logic entirely (that
  // is the inline list's story). Hook above still runs unconditionally.
  if (variant === "rail") {
    if (items.length === 0) return null;
    return <InFlightRailStrip items={items} ariaLabel={ariaLabel} />;
  }
  if (variant === "expanded") {
    if (items.length === 0) return null;
    return <InFlightPills items={items} ariaLabel={ariaLabel} />;
  }

  const resolved: Exclude<InFlightListDensity, "auto"> =
    density !== "auto"
      ? density
      : size.w >= FULL_MIN_WIDTH
        ? "full"
        : size.w >= COMPACT_MIN_WIDTH
          ? "compact"
          : "badge";

  // Nothing in flight renders nothing, as before. The measurement survives:
  // the hook keeps its last size across the empty render, and the observer
  // re-fires as soon as a real box mounts again, so at worst one frame shows
  // the seeded full form before settling.
  if (items.length === 0) return null;

  if (resolved === "badge") {
    return (
      <InFlightBadge
        ref={ref}
        items={items}
        mode={mode}
        ariaLabel={ariaLabel}
      />
    );
  }

  return (
    <InFlightList__Root
      ref={ref}
      aria-label={ariaLabel}
      data-mode={mode}
      data-density={resolved}
      $row={orientation === "row"}
    >
      {items.map((item) => (
        <InFlightRow
          key={item.id}
          item={item}
          $compact={resolved === "compact"}
        />
      ))}
    </InFlightList__Root>
  );
}

// v3 rail strip geometry (operator's v3 design). Each in-flight command is a
// blip that renders effectively OFF the widget, its centre sitting ABOVE the
// top edge (cy negative, outside the 0..RAIL_VB_H viewBox, so the disc itself is
// never drawn), and only its soft radial BLUR grazes down onto the top edge. The
// glow's x tracks the command's TRUE journey progress (0 left .. 1 right across
// the 3 signal stages), so it sweeps the edge as the command travels. Drawn with
// preserveAspectRatio="none" (viewBox stretched to the full widget width). No
// baseline or dividers: a grazing glow, not markers on a line.
const RAIL_VB_W = 100;
const RAIL_VB_H = 16;
// The blip centre sits this far ABOVE the top edge; only the lower falloff of a
// radius-GLOW_R glow reaches into the strip, so the disc is unseen and the edge
// gets a soft graze that fades downward.
const GLOW_CY = -4;
const GLOW_R = 9;
const GLOW_PEAK_ALPHA = 0.22;

/** Anchor by phase when an item carries no true `progress` (a hand-built item
 * from a non-`useCommand` source); mirrors `toInFlightListItems`' fallback. */
const PHASE_PROGRESS: Record<InFlightListItem["phase"], number> = {
  "in-transit": 0.18,
  "awaiting-reply": 0.5,
  due: 0.62,
  overdue: 0.82,
  lost: 0.95,
};

function InFlightRailStrip({
  items,
  ariaLabel,
}: {
  items: InFlightListItem[];
  ariaLabel: string;
}) {
  const gradBase = useId();
  const summary = `${items.length} in flight`;
  return (
    <InFlightRailStrip__Svg
      role="img"
      aria-label={`${ariaLabel}: ${summary}`}
      viewBox={`0 0 ${RAIL_VB_W} ${RAIL_VB_H}`}
      preserveAspectRatio="none"
    >
      <defs>
        {items.map((item, i) => {
          const colour = ERROR_PHASES.has(item.phase)
            ? "var(--color-status-warning-bg)"
            : "var(--color-accent-fg)";
          const progress = Math.max(
            0,
            Math.min(1, item.progress ?? PHASE_PROGRESS[item.phase]),
          );
          const cx = progress * RAIL_VB_W;
          return (
            <radialGradient
              key={item.id}
              id={`${gradBase}-${i}`}
              gradientUnits="userSpaceOnUse"
              cx={cx}
              cy={GLOW_CY}
              r={GLOW_R}
            >
              <stop
                offset="0"
                stopColor={colour}
                stopOpacity={GLOW_PEAK_ALPHA}
              />
              <stop offset="1" stopColor={colour} stopOpacity="0" />
            </radialGradient>
          );
        })}
      </defs>
      {items.map((item, i) => (
        <rect
          key={item.id}
          data-role="glow"
          data-phase={item.phase}
          x="0"
          y="0"
          width={RAIL_VB_W}
          height={RAIL_VB_H}
          fill={`url(#${gradBase}-${i})`}
        />
      ))}
    </InFlightRailStrip__Svg>
  );
}

/**
 * The whole queue as one chip: how many are out, and when the next one
 * arrives. Those are the two facts that change what an operator does next;
 * everything else is detail they can get by making the widget bigger.
 */
const InFlightBadge = function InFlightBadge({
  ref,
  items,
  mode,
  ariaLabel,
}: {
  ref: RefObject<HTMLDivElement>;
  items: InFlightListItem[];
  mode?: InFlightListMode;
  ariaLabel: string;
}) {
  const countdown = useCountdown(nearestEta(items));
  const worst = items.some((i) => ERROR_PHASES.has(i.phase));
  const summary =
    countdown === null
      ? `${items.length} in flight`
      : `${items.length} in flight, next in ${formatCountdown(countdown)}`;
  return (
    <InFlightList__Root
      ref={ref}
      aria-label={`${ariaLabel}: ${summary}`}
      data-mode={mode}
      data-density="badge"
      title={items.map((i) => i.label).join("\n")}
      $row={false}
    >
      <InFlightList__Row $phase={worst ? "overdue" : "in-transit"}>
        <InFlightList__Arrow aria-hidden="true" $pulse={!worst}>
          ↑
        </InFlightList__Arrow>
        <InFlightList__Phase>
          {items.length}
          {countdown !== null && ` · ${formatCountdown(countdown)}`}
        </InFlightList__Phase>
      </InFlightList__Row>
    </InFlightList__Root>
  );
};

function InFlightRow({
  item,
  $compact,
}: {
  item: InFlightListItem;
  $compact: boolean;
}) {
  const countdown = useCountdown(item.etaSeconds);
  const isError = ERROR_PHASES.has(item.phase);
  const spoken =
    countdown === null
      ? `${item.label}, ${item.phase}`
      : `${item.label}, ${formatCountdown(countdown)}`;
  return (
    // Compact drops the visible label, so the row carries it as its own
    // accessible name instead: a screen reader hears the same thing at every
    // density. `title` is the sighted equivalent, and only that: it is not
    // keyboard reachable, so it is a convenience on top of the accessible
    // name rather than the thing carrying the information.
    <InFlightList__Row
      $phase={item.phase}
      {...($compact
        ? { role: "listitem", "aria-label": spoken, title: spoken }
        : {})}
    >
      <InFlightList__Arrow aria-hidden="true" $pulse={!isError}>
        {PHASE_ARROW[item.phase]}
      </InFlightList__Arrow>
      {!$compact && <InFlightList__Label>{item.label}</InFlightList__Label>}
      <InFlightList__Phase>
        {countdown === null ? item.phase : formatCountdown(countdown)}
      </InFlightList__Phase>
    </InFlightList__Row>
  );
}

const InFlightRailStrip__Svg = styled.svg`
  display: block;
  width: 100%;
  height: 16px;
`;

// v3 expanded (grown/pinned) discrete view: a rich pill per command, the Fable
// mock's `.pill`. Leg colour distinguishes the journey stage (uplink out / echo
// back / due / fault), and a 2px bottom bar tracks the command's true progress.
const PILL_COLOUR: Record<InFlightListItem["phase"], string> = {
  "in-transit": "var(--color-data-1)",
  "awaiting-reply": "var(--color-data-10)",
  due: "var(--color-accent-fg)",
  overdue: "var(--color-status-warning-bg)",
  lost: "var(--color-status-nogo-fg)",
};

const PHASE_TAG: Record<InFlightListItem["phase"], string> = {
  "in-transit": "uplink",
  "awaiting-reply": "echo",
  due: "due",
  overdue: "overdue",
  lost: "lost",
};

function InFlightPills({
  items,
  ariaLabel,
}: {
  items: InFlightListItem[];
  ariaLabel: string;
}) {
  return (
    <InFlightPills__List aria-label={ariaLabel}>
      {items.map((item) => (
        <InFlightPillRow key={item.id} item={item} />
      ))}
    </InFlightPills__List>
  );
}

function InFlightPillRow({ item }: { item: InFlightListItem }) {
  const countdown = useCountdown(item.etaSeconds);
  const colour = PILL_COLOUR[item.phase];
  const progress = Math.max(
    0,
    Math.min(1, item.progress ?? PHASE_PROGRESS[item.phase]),
  );
  return (
    <InFlightPills__Pill data-phase={item.phase}>
      <InFlightPills__Tag style={{ color: colour }}>
        {PHASE_TAG[item.phase]}
      </InFlightPills__Tag>
      <InFlightPills__Label>{item.label}</InFlightPills__Label>
      <InFlightPills__Time style={{ color: colour }}>
        {countdown === null ? item.phase : formatCountdown(countdown)}
      </InFlightPills__Time>
      <InFlightPills__Bar
        style={{ width: `${progress * 100}%`, background: colour }}
      />
    </InFlightPills__Pill>
  );
}

const InFlightPills__List = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 4px);
  width: 100%;
`;

const InFlightPills__Pill = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-8, 8px);
  overflow: hidden;
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md, 4px);
  padding: var(--space-4, 4px) var(--space-8, 8px);
  background: color-mix(in srgb, var(--color-surface-sunken) 70%, transparent);
  font-size: var(--font-size-sm);
`;

const InFlightPills__Tag = styled.span`
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const InFlightPills__Label = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-primary);
`;

const InFlightPills__Time = styled.span`
  flex: 0 0 auto;
  font-family: var(--font-family-mono);
  font-variant-numeric: tabular-nums;
`;

const InFlightPills__Bar = styled.span`
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
`;

const InFlightList__Root = styled.div<{ $row: boolean }>`
  flex: 0 0 auto;
  display: flex;
  flex-direction: ${({ $row }) => ($row ? "row" : "column")};
  flex-wrap: ${({ $row }) => ($row ? "wrap" : "nowrap")};
  column-gap: var(--space-8, 8px);
  gap: var(--space-2, 2px);
  padding: var(--space-4, 4px) var(--space-8, 8px);
  font-family: monospace;
  font-size: var(--font-size-xs);
  background: var(--color-surface-panel);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-md, 4px);
  box-sizing: border-box;
`;

const PHASE_ROW_STYLES: Record<
  InFlightListItem["phase"],
  ReturnType<typeof css>
> = {
  "in-transit": css`
    color: var(--color-text-primary);
  `,
  "awaiting-reply": css`
    color: var(--color-text-muted);
  `,
  due: css`
    color: var(--color-text-muted);
  `,
  overdue: css`
    color: var(--color-status-warning-fg);
  `,
  lost: css`
    color: var(--color-status-nogo-fg);
  `,
};

const InFlightList__Row = styled.div<{ $phase: InFlightListItem["phase"] }>`
  display: flex;
  align-items: baseline;
  gap: var(--space-6, 6px);

  ${({ $phase }) => PHASE_ROW_STYLES[$phase]}
`;

const InFlightList__Arrow = styled.span<{ $pulse: boolean }>`
  flex: 0 0 auto;
  color: var(--color-accent-fg);

  ${({ $pulse }) =>
    $pulse &&
    css`
      @media (prefers-reduced-motion: no-preference) {
        animation: in-flight-list-pulse 1.6s var(--ease-emphasis, ease-in-out) infinite;
      }
    `}

  @keyframes in-flight-list-pulse {
    50% {
      opacity: 0.35;
    }
  }
`;

const InFlightList__Label = styled.span`
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const InFlightList__Phase = styled.span`
  flex: 0 0 auto;
  color: inherit;
  opacity: 0.85;
`;
