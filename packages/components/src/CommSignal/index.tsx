import type { AnyAugment, ComponentProps } from "@ksp-gonogo/core";
import {
  AugmentSlot,
  getAugmentsForSlot,
  getWidgetShape,
  registerComponent,
  useAugmentAvailable,
  useTelemetry,
} from "@ksp-gonogo/core";
import { useStream, type VesselState } from "@ksp-gonogo/sitrep-client";
import { value } from "@ksp-gonogo/sitrep-sdk";
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
import { type ReactNode, useCallback, useEffect, useState } from "react";

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
  const connected = useTelemetry("comms.link")?.connected;
  const strength = useTelemetry("vessel.comms")?.signalStrength;
  const vesselState = useStream<VesselState>("vessel.state");
  // Collapse the derived channel's `null` (comms unknown this tick) to
  // `undefined` so the empty-state + `describeControl` semantics match the
  // old single-value legacy read exactly.
  const controlState = vesselState?.commsControlStateOrdinal ?? undefined;
  const controlStateName = vesselState?.commsControlStateName ?? undefined;
  const delay = useTelemetry("comms.delay")?.oneWaySeconds;

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
          (staging change), carried by a plain span so the title stands alone. */}
      {showSubtitle && (
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
          {connected === false ? "No signal" : "Signal to KSC"}
        </span>
      )}

      {/* With no comms Uplink bound to `comm-signal.sections` (the common
          case), this is the ORIGINAL two-mode layout, unchanged: landscape
          (wide-short) puts the bars/headline cluster and the detail grid
          side by side; portrait stacks them. Neither Cluster nor Stack has an
          even-split "each child grows" mode, so the two children get that
          via a direct style override in landscape.

          Dropping this wrapper's `minHeight: 0` (it used to sit alongside
          `flex: 1`) is the fix for a real overlap bug, not a no-op tidy-up.
          A flex item's AUTOMATIC min-height (the spec default, "auto")
          floors it at its own content size, exactly what stops it being
          crushed by a sibling; explicit `minHeight: 0` cancels that floor.
          Removing the override restores the automatic floor, so this block
          never shrinks below its own content. If combined content still
          outgrows the tile, Panel.Body's own `overflow: auto` (with its
          scroll glow) handles overflow instead of the two overlapping.

          When a comms Uplink DOES bind the slot (e.g. RealAntennas' LINK
          BUDGET panel), the branch below composes it as a SECOND main block
          beside (landscape) or below (portrait) the signal readout, gated on
          `sectionsAugmentPresent` so the column is reserved only when
          there's something to put in it (see that const's comment). In
          landscape the signal readout drops its OWN bars-vs-grid side-by-side
          split and stacks instead: it only owns half the row once the LINK
          BUDGET column sits beside it, and there isn't width for two levels
          of side-by-side split at once (doing both at once visibly collided
          the detail grid into the augment column at 9-wide). The automatic
          min-height floor still holds on every child in both arrangements
          (no `minHeight: 0` override anywhere below), so the same overlap
          protection applies: in portrait the augment section stacks inside
          the SAME Stack as the readout; in landscape it sits beside it
          instead, so the two never compete for vertical space to begin
          with. */}
      {sectionsAugmentPresent ? (
        isLandscape ? (
          <Cluster align="start" style={{ flex: 1, gap: "var(--space-24)" }}>
            <Stack gap="md" style={{ flex: "1 1 0", minWidth: 0 }}>
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
            </Stack>

            {/* LINK BUDGET column, beside the signal readout. */}
            <div style={{ flex: "1 1 0", minWidth: 0 }}>
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

            {/* Stacked below the signal readout for narrow tiles. */}
            <AugmentSlot name="comm-signal.sections" props={{}} />
          </Stack>
        )
      ) : isLandscape ? (
        <Cluster
          justify="between"
          align="center"
          style={{ flex: 1, gap: "var(--space-24)" }}
        >
          <Cluster justify="start" wrap style={{ flex: "1 1 0", minWidth: 0 }}>
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
        </Stack>
      )}
    </Panel>
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
    "Signal bars, percentage, probe control state (full / partial / none), and signal delay from KSP's CommNet.",
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
  ],
  defaultConfig: {},
  actions: [],
  pushable: true,
  requires: ["flight"],
});

export { CommSignalComponent };
