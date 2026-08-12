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
import { buildCommsRouteNodes, commsRouteRelayCount } from "./commsRoute";

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
  // Wide-short: put the bars/headline cluster and the detail grid side-by-side
  // so the width is used instead of clustering top-left.
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
  // The full hop-by-hop route needs more vertical room than the detail grid
  // alone: it's a fourth block stacked below bars+headline+grid. Landscape
  // frees that room sideways (bars/grid sit side by side, see below), so it
  // only needs the detail grid's own rows>=4 floor; portrait/square stacks
  // everything in one column and needs real headroom above that, or the
  // route gets clipped at the registered default (6x5) with nothing to show
  // for it. Below the threshold the subtitle still names the centre, just
  // with a hop-count hint instead of the chain (`hopHint` below), so a
  // cramped tile never loses the route entirely, only its detail.
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
  // mode with an augment column present renders it from a SECOND spot, inside
  // the readout Stack; see the top-alignment comment further down.
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
          (staging change), carried by a plain span so the title stands alone.
          Rendered here for every branch EXCEPT landscape-with-augment: that
          one needs the subtitle INSIDE the readout column instead (see
          `subtitle` below), so its own top line lines up with the augment
          column's "LINK BUDGET" header rather than sitting a line above both
          columns. */}
      {!(isLandscape && sectionsAugmentPresent) && subtitle}

      {/* Landscape (wide-short) puts the bars/headline cluster and the
          detail grid side by side; portrait stacks them. Neither Cluster nor
          Stack has an even-split "each child grows" mode, so the two
          children get that via a direct style override in landscape. The
          route, when it fits (`showFullPath`), is always a further child of
          whichever box carries bars+grid, never a sibling positioned after
          it: a sibling after a box that's free to shrink gets its layout box
          computed from the SHRUNK size while the shrunk box's own
          overflowing content keeps painting at full size, visually
          overlapping whatever comes next. Keeping the route inside the same
          box sidesteps that.

          When a comms Uplink DOES bind the slot (e.g. RealAntennas' LINK
          BUDGET panel), the branch below composes it as a SECOND main block
          beside (landscape) or below (portrait) the signal readout, gated on
          `sectionsAugmentPresent` so the column is reserved only when
          there's something to put in it (see that const's comment). In
          landscape the signal readout drops its OWN bars-vs-grid side-by-side
          split and stacks instead, there isn't width for two levels of
          side-by-side split at once (doing both at once visibly collided the
          detail grid into the augment column at 9-wide). The readout and the
          LINK BUDGET column pack to the left with the normal cluster gap
          between them, each sized to its own content rather than stretched
          to fill the row: they read as one adjacent pair, not two blocks
          pinned to opposite edges, and any width left over on a very wide
          tile just sits empty on the right. In portrait the augment section
          stacks inside the SAME Stack as the readout; in landscape it sits
          beside it instead, so the two never compete for vertical space to
          begin with.

          In landscape the readout Stack also picks up the subtitle as its
          OWN first line (dropped from above via the `!(isLandscape &&
          sectionsAugmentPresent)` guard), so it top-aligns with the augment
          column's "LINK BUDGET" header instead of sitting a line above the
          whole row: "Signal to <centre>" and "LINK BUDGET" read as two
          column headers on the same line, each column's content flowing
          down from there. The route sits inside this SAME readout column,
          for the same shrink-then-overlap reason the no-augment landscape
          case below keeps it inside its own Stack rather than as a
          trailing sibling. */}
      {sectionsAugmentPresent ? (
        isLandscape ? (
          <Cluster
            justify="start"
            align="start"
            style={{ flex: 1, gap: "var(--space-24)" }}
          >
            <Stack gap="md" style={{ flex: "0 1 auto", minWidth: 0 }}>
              {subtitle}
              <Cluster justify="start" wrap>
                <SignalBars bars={bars} tone={control.tone} />
                <SignalHeadline
                  headline={headline}
                  lost={connected === false}
                />
              </Cluster>

              {showDetailGrid && (
                <Grid cols="auto 1fr" gap="md" rowGap="xs" align="baseline">
                  <CommSignalDetailRows control={control} delay={delay} />
                </Grid>
              )}

              {showFullPath && (
                <CommsPathRoute hops={hops} centreLabel={centreLabel} />
              )}
            </Stack>

            {/* LINK BUDGET column, packed beside the signal readout. */}
            <div style={{ flex: "0 1 auto", minWidth: 0 }}>
              <AugmentSlot name="comm-signal.sections" props={{}} />
            </div>
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
              <CommsPathRoute hops={hops} centreLabel={centreLabel} />
            )}

            {/* Stacked below the signal readout for narrow tiles. */}
            <AugmentSlot name="comm-signal.sections" props={{}} />
          </Stack>
        )
      ) : isLandscape ? (
        <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
          <Cluster
            justify="between"
            align="center"
            style={{ gap: "var(--space-24)" }}
          >
            <Cluster
              justify="start"
              wrap
              style={{ flex: "1 1 0", minWidth: 0 }}
            >
              <SignalBars bars={bars} tone={control.tone} />
              <SignalHeadline headline={headline} lost={connected === false} />
            </Cluster>

            {showDetailGrid && (
              <Grid
                cols="auto 1fr"
                gap="md"
                rowGap="xs"
                align="baseline"
                style={{ flex: "1 1 0", minWidth: 0 }}
              >
                <CommSignalDetailRows control={control} delay={delay} />
              </Grid>
            )}
          </Cluster>

          {showFullPath && (
            <CommsPathRoute hops={hops} centreLabel={centreLabel} />
          )}
        </Stack>
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
            <CommsPathRoute hops={hops} centreLabel={centreLabel} />
          )}
        </Stack>
      )}
    </Panel>
  );
}

// ── Comms-path route (vessel -> relay(s) -> centre) ─────────────────────────

const ROUTE_LABEL_STYLE = {
  color: "var(--color-text-dim)",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
};

/**
 * The full hop chain: "You -> Relay Sat -> KSC", each leg annotated with its
 * distance and, under RealAntennas, its band rate. Renders nothing for an
 * empty `hops` list (no path home is already covered by the LOS headline).
 */
function CommsPathRoute({
  hops,
  centreLabel,
}: {
  hops: readonly CommsHop[];
  centreLabel: string;
}) {
  const nodes = buildCommsRouteNodes(hops, centreLabel);
  if (nodes.length === 0) return null;
  return (
    <Stack gap="xs">
      <Value tone="muted" size="xs" style={ROUTE_LABEL_STYLE}>
        Route
      </Value>
      <Cluster gap="xs" wrap align="center">
        {nodes.map((node, i) => (
          <Fragment
            key={
              i === 0
                ? "route-origin"
                : `${hops[i - 1].from}=>${hops[i - 1].to}`
            }
          >
            {i > 0 && <CommsPathLeg hop={hops[i - 1]} />}
            <Value
              tone="default"
              size="sm"
              title={node.title}
              style={{
                fontWeight: i === 0 || i === nodes.length - 1 ? 600 : 400,
              }}
            >
              {node.label}
            </Value>
          </Fragment>
        ))}
      </Cluster>
    </Stack>
  );
}

/** One leg's distance (+ RA band rate, when present) between two route nodes. */
function CommsPathLeg({ hop }: { hop: CommsHop }) {
  return (
    <Cluster
      gap="xs"
      align="baseline"
      style={{ color: "var(--color-text-dim)" }}
    >
      <span aria-hidden="true">{"->"}</span>
      {hop.distanceMeters !== undefined && (
        <Value tone="muted" size="xs">
          <Unit value={hop.distanceMeters} />
        </Value>
      )}
      {/* RealAntennas-only per-hop rate annotation (Comms.cs's own doc):
          absent under bare CommNet, so this simply never renders there. */}
      {hop.bandRateBitsPerSec !== undefined && (
        <Value tone="muted" size="xs">
          <Unit value={hop.bandRateBitsPerSec} />
        </Value>
      )}
      <span aria-hidden="true">{"->"}</span>
    </Cluster>
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
  ],
  defaultConfig: {},
  actions: [],
  pushable: true,
  requires: ["flight"],
});

export { CommSignalComponent };
