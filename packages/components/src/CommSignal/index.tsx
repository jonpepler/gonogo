import type { AnyAugment, ComponentProps } from "@ksp-gonogo/core";
import {
  AugmentSlot,
  getAugmentsForSlot,
  getWidgetShape,
  registerComponent,
  useAugmentAvailable,
  useTelemetry,
} from "@ksp-gonogo/core";
import {
  useLatestValue,
  useStream,
  type VesselState,
} from "@ksp-gonogo/sitrep-client";
import { type CommsHop, type CommsPath, value } from "@ksp-gonogo/sitrep-sdk";
import {
  Cluster,
  Countdown,
  EmptyState,
  Grid,
  NULL_DISPLAY,
  Panel,
  Stack,
  Unit,
  Value,
  VisuallyHidden,
} from "@ksp-gonogo/ui-kit";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  buildCommsRouteNodes,
  type CommsRouteNode,
  commsLegTimeSeconds,
  commsRouteRelayCount,
} from "./commsRoute";

type CommSignalConfig = Record<string, never>;

// ── Augment slots (Uplink architecture) ─────────────────────────────────────
//
// CommSignal exposes two slots so a comms Uplink can extend the readout WITHOUT
// this widget ever importing backend-aware code (locked map: comm-signal):
//
//  - `comm-signal.sections` (body, below the signal-bars readout): the primary
//    HIGH-value seat. A RealAntennas Uplink elected via capability contributes a
//    per-antenna breakdown table (which antenna carries the link, its SNR) here,
//    reading only its OWN RA Topics. CommSignal stays RA-agnostic.
//  - `comm-signal.badges` (header, next to the title): the broad escape hatch
//    for small at-a-glance chips a comms Uplink wants beside the COMMNET title.
//
// Neither slot passes parent coordinates/projection (they aren't overlay slots),
// so the props contract is empty, augments render from their own Topics. The
// declaration-merge below keeps the slot ids co-located here rather
// than in a shared central registry, so parallel widget work never collides.
declare module "@ksp-gonogo/core" {
  interface SlotRegistry {
    "comm-signal.sections": Record<string, never>;
    "comm-signal.badges": Record<string, never>;
  }
}

// Telemachus' `comm.controlState` is an enum:
//   0 = none, 1 = partial (unmanned probe with crew nearby etc.), 2 = full
// The name accessor `comm.controlStateName` mirrors the stock KSP string so
// we prefer it when present and fall back to the integer for legacy.
function describeControl(
  name: string | undefined,
  state: number | undefined,
): {
  label: string;
  tone: "ok" | "warn" | "lost";
} {
  const resolved =
    name && name.length > 0
      ? name
      : state === 2
        ? "Full"
        : state === 1
          ? "Partial"
          : state === 0
            ? "None"
            : NULL_DISPLAY;
  const lower = resolved.toLowerCase();
  if (lower === "none" || lower.includes("no signal"))
    return { label: resolved, tone: "lost" };
  if (lower === "partial" || lower.includes("partial"))
    return { label: resolved, tone: "warn" };
  return { label: resolved, tone: "ok" };
}

/**
 * Reports one `comm-signal.sections` augment's live Domain availability up to
 * CommSignal, via `useAugmentAvailable`: the SAME gate `<AugmentSlot>` itself
 * applies before ever rendering that augment's component. Isolated into its
 * own component (mirrors MapView's `VanillaSuppressionProbe`) so the
 * `useTelemetry` hook underneath has a stable position per augment
 * regardless of how many candidates are registered. Renders nothing, this
 * exists purely to answer "does the LINK BUDGET column currently have
 * anything to show", decoupled from mere registration: a bundled-but-not-
 * running Uplink client registers its augments unconditionally at import
 * time (same class of bug `AugmentDefinition.suppressesVanillaBase`'s doc
 * comment in augments.ts warns about for MapView's analogous decision).
 * Without this, the LINK BUDGET column would be reserved (wasting half the
 * row) the moment the RealAntennas Uplink is bundled, even on a vessel/save
 * where its Domain never reports live.
 */
function SectionsAvailabilityProbe({
  augment,
  onAvailableChange,
}: Readonly<{
  augment: AnyAugment;
  onAvailableChange: (id: string, available: boolean) => void;
}>) {
  const available = useAugmentAvailable(augment);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reports on every value change; onAvailableChange is a stable useCallback (empty dep list) below
  useEffect(() => {
    onAvailableChange(augment.id, available);
    // Drop this augment's contribution on unmount (deregistered, or the
    // slot's registered set changes).
    return () => onAvailableChange(augment.id, false);
  }, [augment.id, available]);
  return null;
}

function CommSignalComponent({
  w,
  h,
}: Readonly<ComponentProps<CommSignalConfig>>) {
  // Every read has a clean stream home now:
  //  - `comm.connected`     -> `comms.link.connected` (the freeze-EXEMPT link
  //    channel: vessel.comms freezes at last-known through a blackout, so the
  //    disconnect edge only fires off comms.link; see map-topic.ts)
  //  - `comm.signalStrength`-> `vessel.comms.signalStrength`
  //  - `comm.controlState`  -> `vessel.state.commsControlStateOrdinal` (the
  //    SDK-derived collapse of `vessel.comms.controlState`'s rich `ControlState`
  //    enum onto this widget's 0/1/2 level scheme; see `vessel-state.ts`)
  //  - `comm.controlStateName` -> `vessel.state.commsControlStateName` (that
  //    same ordinal resolved to its enum NAME string)
  //  - `comm.signalDelay`   -> `comms.delay.oneWaySeconds` (gonogo's own
  //    SignalDelay authority, live via CommsCoreUplink)
  //
  // comms-command-centre-experiment: `comms.commandCentre` names WHICH
  // centre (KSC, or a crewed control-source vessel under the stock
  // "6-kerbal command center" mechanic) the active vessel's own path
  // resolved to this tick. Every other read above is already relative to
  // that centre (stock always prefers a route home, falling back to the
  // nearest control source only when no home is reachable), this is only
  // the label. Absent/unknown falls back to "KSC", the honest default: it's
  // the only centre the game itself ever creates without a mod or a crewed
  // vessel meeting the control-source threshold.
  //
  // `comms.path` names the ROUTE that centre label is relative to: the
  // ordered hops from the active vessel to the centre (direct, or via one
  // or more relays), each with a distance and, under RealAntennas, a
  // per-hop band/rate annotation. It's command-centre dispatch-time
  // bookkeeping, not delayed craft telemetry (same class as
  // `comms.commandCentre` above), so it rides `useLatestValue` rather than
  // `useTelemetry`'s delay-gated view sample: see `FleetComms/index.tsx`'s
  // doc comment for why a TrueNow topic needs the un-gated read.
  const connected = useTelemetry("comms.link")?.connected;
  const strength = useTelemetry("vessel.comms")?.signalStrength;
  const vesselState = useStream<VesselState>("vessel.state");
  // Collapse the derived channel's `null` (comms unknown this tick) to
  // `undefined` so the empty-state + `describeControl` semantics match the
  // old single-value legacy read exactly.
  const controlState = vesselState?.commsControlStateOrdinal ?? undefined;
  const controlStateName = vesselState?.commsControlStateName ?? undefined;
  const delay = useTelemetry("comms.delay")?.oneWaySeconds;
  const commandCentreName = useTelemetry("comms.commandCentre")?.displayName;
  const centreLabel =
    commandCentreName && commandCentreName.length > 0
      ? commandCentreName
      : "KSC";
  const hops = useLatestValue<CommsPath>("comms.path")?.hops ?? [];
  const relayCount = commsRouteRelayCount(hops);
  // Gonogo is the experience FROM the command centre: the route's source
  // stop is named for the active vessel, never "you". Falls back to a
  // generic label on the rare tick `vessel.identity` hasn't resolved yet
  // (e.g. right at scene load), same shape as the `centreLabel` fallback
  // above.
  const vesselName = useTelemetry("vessel.identity")?.name;
  const vesselLabel =
    vesselName && vesselName.length > 0 ? vesselName : "Vessel";

  // Live (not merely registered) `comm-signal.sections` augments, fed by
  // `SectionsAvailabilityProbe` below, one per candidate augment. Declared
  // here (ahead of the `hasData` early return) so these hooks run
  // unconditionally on every render, same as the telemetry reads above.
  const sectionsAugments = getAugmentsForSlot("comm-signal.sections");
  const [availableSectionIds, setAvailableSectionIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const handleSectionAvailableChange = useCallback(
    (id: string, available: boolean) => {
      setAvailableSectionIds((prev) => {
        const has = prev.has(id);
        if (available === has) return prev;
        const next = new Set(prev);
        if (available) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  const hasData =
    connected !== undefined ||
    strength !== undefined ||
    controlState !== undefined;

  if (!hasData) {
    return (
      <Panel
        panelTitle="COMMNET"
        panelAside={<AugmentSlot name="comm-signal.badges" props={{}} />}
      >
        <EmptyState>No signal data</EmptyState>
      </Panel>
    );
  }

  // KSP returns signal strength ∈ [0, 1]. Map to 4 discrete bars; this is
  // familiar, readable at a glance, and robust to telemetry jitter at the
  // edges of a connection.
  //
  // Some KSP installs don't publish comm.signalStrength at all (mod load
  // order, RemoteTech overrides, vanilla CommNet variants): in that case
  // we derive bars from comm.controlState so the widget still shows
  // something useful: Full → 4, Partial → 2, None → 0.
  // `.magnitude`: strength is a declared ratio and arrives wrapped. The bar
  // count and the headline percentage are both arithmetic on it, and the old
  // `typeof === "number"` test silently answered "no strength reading" for
  // every live link.
  const raw = strength?.magnitude;
  const strengthValid =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0;
  const pct = strengthValid ? Math.max(0, Math.min(1, raw)) : null;
  let bars: number;
  if (connected === false) {
    bars = 0;
  } else if (pct !== null) {
    bars = Math.max(1, Math.ceil(pct * 4));
  } else if (controlState === 2) {
    bars = 4;
  } else if (controlState === 1) {
    bars = 2;
  } else if (controlState === 0) {
    bars = 0;
  } else {
    bars = 0;
  }
  const control = describeControl(controlStateName, controlState);

  // Selective rendering: bars + headline value always show; subtitle and
  // detail grid drop as height shrinks.
  const cols = w ?? 6;
  const rows = h ?? 5;
  // Wide-short: the signal readout, route, and LINK BUDGET column (when
  // present) sit side by side instead of clustering top-left.
  const isLandscape = getWidgetShape(w, h).shape === "landscape";
  const showSubtitle = rows >= 4;
  const showDetailGrid = rows >= 4 && cols >= 4;
  // Gates whether a LINK BUDGET column is reserved at all: with no comms
  // Uplink's `comm-signal.sections` augment currently LIVE, no column is
  // rendered and its width goes back to the signal readout instead of
  // sitting empty beside it. Fed by `availableSectionIds` (see
  // `SectionsAvailabilityProbe` above), not by mere registration: a
  // bundled-but-not-running Uplink client would otherwise still claim the
  // column.
  const sectionsAugmentPresent = availableSectionIds.size > 0;
  // The vertical train-schedule needs more room than the detail grid alone:
  // in landscape it's a whole extra column beside the readout, so it only
  // needs the detail grid's own rows>=4 floor; portrait/square stacks it
  // below the readout instead and needs real headroom above that, or the
  // schedule gets clipped at the registered default (6x5) with nothing to
  // show for it. Below the threshold the subtitle still names the centre,
  // just with a hop-count hint instead of the schedule (`hopHint` below), so
  // a cramped tile never loses the route entirely, only its detail.
  const showFullPath = cols >= 5 && (isLandscape ? rows >= 4 : rows >= 6);
  const hopHint =
    connected !== false && hops.length > 0 && !showFullPath
      ? relayCount === 0
        ? " (direct)"
        : ` (${relayCount} relay${relayCount === 1 ? "" : "s"})`
      : "";
  // "LOS" (loss of signal) vs NULL_DISPLAY (no telemetry), both render zero
  // bars, so the headline label is the only differentiator at tiny
  // sizes where subtitle + detail grid are suppressed. Without this
  // split, an occluded vessel and a connection-lost probe looked
  // identical in the min-3x3 mode.
  const headline =
    connected === false ? (
      "LOS"
    ) : pct !== null ? (
      <Unit value={value("%", pct * 100)} decimals={0} />
    ) : (
      control.label
    );

  // A11y: the visible readout updates on every telemetry tick (percentage,
  // bar count), so it must NOT be a live region, that would flood the screen
  // reader (see CLAUDE.md: "Don't live-region streaming telemetry"). Instead a
  // dedicated visually-hidden status node announces only the connection-state
  // transition: its text changes between "Signal connected" / "Signal lost",
  // which fires at most once per LOS/regain. The loud role=alert is owned by
  // the separate SignalLossBanner primitive at the page level, we don't
  // duplicate it here.
  const liveAnnouncement =
    connected === false
      ? "Signal lost"
      : connected === true
        ? "Signal connected"
        : "";

  // Extracted (rather than inlined at its one call site) because landscape
  // mode renders it from a SECOND spot, as the readout column's own first
  // line, so it top-aligns with the route/LINK BUDGET columns beside it
  // instead of sitting above the whole row; see the comment further down.
  const subtitle = showSubtitle && (
    <span
      style={{
        fontSize: "var(--font-size-xs)",
        color:
          connected === false
            ? "var(--color-status-nogo-fg)"
            : "var(--color-text-dim)",
        letterSpacing: "0.04em",
      }}
    >
      {connected === false ? "No signal" : `Signal to ${centreLabel}${hopHint}`}
    </span>
  );

  return (
    <Panel
      panelTitle="COMMNET"
      panelAside={<AugmentSlot name="comm-signal.badges" props={{}} />}
    >
      <VisuallyHidden role="status" aria-live="polite">
        {liveAnnouncement}
      </VisuallyHidden>

      {/* Invisible per-augment probes feeding `sectionsAugmentPresent`
          above: always mounted regardless of layout branch, one per
          candidate `comm-signal.sections` augment. */}
      {sectionsAugments.map((augment) => (
        <SectionsAvailabilityProbe
          key={augment.id}
          augment={augment}
          onAvailableChange={handleSectionAvailableChange}
        />
      ))}

      {/* Link caption relocated out of the panel subtitle into the body
          (staging change), carried by a plain span so the title stands
          alone. Rendered here in portrait; landscape carries it as the
          readout column's OWN first line instead (see below), so it
          top-aligns with the other columns' headers rather than sitting a
          line above the whole row. */}
      {!isLandscape && subtitle}

      {/* The widget reflows at the CONTAINER level, never internally: the
          train-schedule route is ALWAYS vertical, it does not rotate.
          Landscape (wide) lays the signal readout, the route, and (when a
          comms Uplink binds the slot) the LINK BUDGET column out as
          side-by-side flex columns, each sized to its own content
          (`flex: "0 1 auto"`) rather than stretched to fill the row: they
          read as an adjacent row of panels, not blocks pinned to opposite
          edges, and any width left over on a very wide tile just sits empty
          on the right. Portrait (narrow) stacks the same three blocks
          vertically instead, the route's own internal rail unchanged either
          way. */}
      {isLandscape ? (
        <Cluster
          justify="start"
          align="start"
          style={{ flex: 1, gap: "var(--space-24)" }}
        >
          <Stack gap="md" style={{ flex: "0 1 auto", minWidth: 0 }}>
            {subtitle}
            <Cluster justify="start" wrap>
              <SignalBars bars={bars} tone={control.tone} />
              <SignalHeadline headline={headline} lost={connected === false} />
            </Cluster>

            {showDetailGrid && (
              <Grid cols="auto 1fr" gap="md" rowGap="xs" align="baseline">
                <CommSignalDetailRows control={control} delay={delay} />
              </Grid>
            )}
          </Stack>

          {showFullPath && (
            <div style={{ flex: "0 1 auto", minWidth: 0 }}>
              <CommsPathRoute
                hops={hops}
                vesselLabel={vesselLabel}
                centreLabel={centreLabel}
                delaySeconds={delay?.magnitude}
              />
            </div>
          )}

          {sectionsAugmentPresent && (
            <div style={{ flex: "0 1 auto", minWidth: 0 }}>
              <AugmentSlot name="comm-signal.sections" props={{}} />
            </div>
          )}
        </Cluster>
      ) : (
        <Stack gap="md" style={{ flex: 1 }}>
          <Cluster justify="start" wrap>
            <SignalBars bars={bars} tone={control.tone} />
            <SignalHeadline headline={headline} lost={connected === false} />
          </Cluster>

          {showDetailGrid && (
            <Grid cols="auto 1fr" gap="md" rowGap="xs" align="baseline">
              <CommSignalDetailRows control={control} delay={delay} />
            </Grid>
          )}

          {showFullPath && (
            <CommsPathRoute
              hops={hops}
              vesselLabel={vesselLabel}
              centreLabel={centreLabel}
              delaySeconds={delay?.magnitude}
            />
          )}

          {sectionsAugmentPresent && (
            <AugmentSlot name="comm-signal.sections" props={{}} />
          )}
        </Stack>
      )}
    </Panel>
  );
}

// ── Comms-path route: a vertical train-schedule (vessel at top, centre at
//    bottom) ───────────────────────────────────────────────────────────────

const ROUTE_LABEL_STYLE = {
  color: "var(--color-text-dim)",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
};

// Rail geometry: a dashed vertical line down the left edge with a circle at
// each stop, train-schedule style. The line is a `borderLeft` on every row's
// rail slot (stop rows AND leg rows): adjoining slots share an edge, so the
// dash pattern reads as one continuous rail down the column rather than a
// broken segment per row.
const RAIL_WIDTH_PX = 20;
const RAIL_STOP_DIAMETER_PX = 10;

/**
 * The vertical train-schedule: the source vessel at the top, each relay as a
 * circle on the rail, the command centre at the bottom. Each leg's distance
 * AND light-time (and RA band rate, when present) sit in the gap between its
 * two stops, against the rail. Renders nothing for an empty `hops` list (no
 * path home is already covered by the LOS headline).
 */
function CommsPathRoute({
  hops,
  vesselLabel,
  centreLabel,
  delaySeconds,
}: {
  hops: readonly CommsHop[];
  vesselLabel: string;
  centreLabel: string;
  /** The path's total one-way delay: apportioned across legs by distance, see `commsLegTimeSeconds`. */
  delaySeconds: number | undefined;
}) {
  const nodes = buildCommsRouteNodes(hops, vesselLabel, centreLabel);
  if (nodes.length === 0) return null;
  return (
    <Stack gap="xs" style={{ minWidth: 0 }}>
      <Value tone="muted" size="xs" style={ROUTE_LABEL_STYLE}>
        Route
      </Value>
      <div>
        {nodes.map((node, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stops have no stable identity beyond their position along the rail
          <Fragment key={i}>
            <CommsPathStop
              node={node}
              emphasize={i === 0 || i === nodes.length - 1}
            />
            {i < hops.length && (
              <CommsPathLeg
                hop={hops[i]}
                hops={hops}
                delaySeconds={delaySeconds}
              />
            )}
          </Fragment>
        ))}
      </div>
    </Stack>
  );
}

/** One stop on the rail: a circle marker plus the stop's label. */
function CommsPathStop({
  node,
  emphasize,
}: {
  node: CommsRouteNode;
  emphasize: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-8)",
      }}
    >
      <RailSlot stop />
      <Value
        tone="default"
        size="sm"
        title={node.title}
        style={{ fontWeight: emphasize ? 600 : 400 }}
      >
        {node.label}
      </Value>
    </div>
  );
}

/** One leg's distance AND light-time (+ RA band rate, when present), in the gap against the rail. */
function CommsPathLeg({
  hop,
  hops,
  delaySeconds,
}: {
  hop: CommsHop;
  hops: readonly CommsHop[];
  delaySeconds: number | undefined;
}) {
  const legSeconds = commsLegTimeSeconds(hop, hops, delaySeconds);
  const hasDetail =
    hop.distanceMeters !== undefined || hop.bandRateBitsPerSec !== undefined;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-8)",
        minHeight: hasDetail ? undefined : "var(--space-16)",
      }}
    >
      <RailSlot stop={false} />
      {hasDetail && (
        <Cluster
          gap="xs"
          align="baseline"
          style={{ color: "var(--color-text-dim)" }}
        >
          {hop.distanceMeters !== undefined && (
            <Value tone="muted" size="xs">
              <Unit value={hop.distanceMeters} />
            </Value>
          )}
          {legSeconds !== undefined && (
            // nowrap: `Countdown`'s "0 ms" is plain text with a breaking
            // space, unlike `Unit`'s own number+symbol pairing (which
            // carries its own nowrap), so a narrow column could otherwise
            // split it mid-value across two lines.
            <Value tone="muted" size="xs" style={{ whiteSpace: "nowrap" }}>
              <Countdown value={legSeconds} precise />
            </Value>
          )}
          {/* RealAntennas-only per-hop rate annotation (Comms.cs's own doc):
              absent under bare CommNet, so this simply never renders there. */}
          {hop.bandRateBitsPerSec !== undefined && (
            <Value tone="muted" size="xs">
              <Unit value={hop.bandRateBitsPerSec} />
            </Value>
          )}
        </Cluster>
      )}
    </div>
  );
}

/**
 * One row's slice of the dashed vertical rail: the line itself (a
 * `borderLeft` stretched the row's full height) plus, at a stop row, the
 * circle marker centred on it. Purely decorative, the stop label beside it
 * already carries the same information, so this is hidden from assistive
 * tech rather than duplicated into it.
 */
function RailSlot({ stop }: { stop: boolean }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        width: RAIL_WIDTH_PX,
        alignSelf: "stretch",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: RAIL_WIDTH_PX / 2 - 1,
          top: 0,
          bottom: 0,
          borderLeft: "2px dashed var(--color-border-subtle)",
        }}
      />
      {stop && (
        <div
          style={{
            position: "absolute",
            left: (RAIL_WIDTH_PX - RAIL_STOP_DIAMETER_PX) / 2,
            top: "50%",
            transform: "translateY(-50%)",
            width: RAIL_STOP_DIAMETER_PX,
            height: RAIL_STOP_DIAMETER_PX,
            // border-box: the 2px border must be INCLUDED in the diameter,
            // not added on top of it. Content-box (the default) rendered a
            // 14px circle (10px content + 2px border each side) whose centre
            // sat 2px right of the rail's dashed line, off-centre.
            boxSizing: "border-box",
            borderRadius: "50%",
            background: "var(--color-surface-panel)",
            border: "2px solid var(--color-text-dim)",
          }}
        />
      )}
    </div>
  );
}

// ── Signal-bar chart + detail grid rows ──────────────────────────────────────

type Tone = "ok" | "warn" | "lost";
// Bright fills for the signal bars (non-text UI, full-brightness chips).
const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--color-accent-fg)",
  warn: "var(--color-status-warning-bg)",
  lost: "var(--color-status-nogo-bg)",
};

// Foreground text variants for the same tones, legible on the dark panel.
// Warning uses the muted cream (`-fg` is near-black, meant for the orange
// chip, not standalone text); nogo's `-fg` is already a light pink.
const TONE_TEXT_COLOR: Record<Tone, string> = {
  ok: "var(--color-accent-fg)",
  warn: "var(--color-status-warning-fg-muted)",
  lost: "var(--color-status-nogo-fg)",
};

// Staircase heights (short to tall), sat at the bottom of the bar chart.
const BAR_HEIGHT_PCT = [30, 50, 75, 100];

/**
 * The four-bar signal chart. A bespoke little visual (per-bar computed
 * height/colour, not a chrome shape ui-kit hosts), so it composes plain
 * elements with inline styles rather than a primitive: no styled-components
 * import, same pixel values (6px bars, 24px height) the original off-scale
 * styled.div/span pair used.
 */
function SignalBars({ bars, tone }: { bars: number; tone: Tone }) {
  return (
    <div
      role="img"
      aria-label={`Signal ${bars} of 4`}
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "var(--space-2)",
        height: 24,
      }}
    >
      {[1, 2, 3, 4].map((i) => {
        const lit = i <= bars;
        const color = lit ? TONE_COLOR[tone] : "var(--color-border-subtle)";
        return (
          <span
            key={i}
            style={{
              width: 6,
              background: color,
              border: `1px solid ${color}`,
              // Off-scale on purpose: optical corner softening at the pixel
              // limit on a 6px-wide bar. --radius-xs (2px) rounds this into
              // a lozenge.
              borderRadius: 1,
              height: `${BAR_HEIGHT_PCT[i - 1]}%`,
            }}
          />
        );
      })}
    </div>
  );
}

/** The headline value beside the bars: percentage, LOS, or the control label. */
function SignalHeadline({
  headline,
  lost,
}: {
  headline: ReactNode;
  lost: boolean;
}) {
  return (
    <Value
      tone="default"
      size="lg"
      style={{
        letterSpacing: "0.04em",
        fontWeight: lost ? 700 : 400,
        color: lost ? "var(--color-status-nogo-fg)" : undefined,
      }}
    >
      {headline}
    </Value>
  );
}

/** Control state / signal delay rows, shared by the landscape and portrait grids. */
function CommSignalDetailRows({
  control,
  delay,
}: {
  control: { label: string; tone: Tone };
  delay: Parameters<typeof Countdown>[0]["value"];
}) {
  const labelStyle = {
    color: "var(--color-text-dim)",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
  };
  return (
    <>
      <Value tone="muted" size="xs" style={labelStyle}>
        Control
      </Value>
      <Value
        tone="default"
        size="sm"
        style={{ color: TONE_TEXT_COLOR[control.tone] }}
      >
        {control.label}
      </Value>
      <Value tone="muted" size="xs" style={labelStyle}>
        Delay
      </Value>
      <Value tone="default" size="sm">
        {/* null (no measurable ControlPath) reads the same as undefined
            (nothing arrived yet): comms-delay-nullable-when-no-path fix:
            neither is a duration to show. */}
        {delay == null ? NULL_DISPLAY : <Countdown value={delay} precise />}
      </Value>
    </>
  );
}

// ── Registration ──────────────────────────────────────────────────────────────

registerComponent<CommSignalConfig>({
  id: "comm-signal",
  name: "CommNet Signal",
  description:
    "Signal bars, percentage, probe control state (full / partial / none), signal delay, and the comms-path route (vessel -> relay(s) -> command centre) from KSP's CommNet.",
  tags: ["telemetry", "comms"],
  defaultSize: { w: 6, h: 5 },
  minSize: { w: 3, h: 3 },
  component: CommSignalComponent,
  // Two seats for a comms Uplink to extend the readout without CommSignal ever
  // importing backend-aware code (locked map: comm-signal). See the
  // `SlotRegistry` declaration-merge above for the slot props contracts.
  augmentSlots: ["comm-signal.sections", "comm-signal.badges"],
  dataRequirements: [
    "comm.connected",
    "comm.signalStrength",
    "comm.controlState",
    "comm.controlStateName",
    "comm.signalDelay",
    "comms.commandCentre",
    "comms.path",
    "vessel.identity",
  ],
  defaultConfig: {},
  actions: [],
  pushable: true,
  requires: ["flight"],
});

export { CommSignalComponent };
