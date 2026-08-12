// RealAntennas augments for the base CommSignal widget.
//
// CommSignal (in @ksp-gonogo/components) exposes two slots so a comms Uplink can
// enrich the readout WITHOUT the base widget ever importing backend-aware code:
// `comm-signal.badges` (a chip beside the COMMNET title) and
// `comm-signal.sections` (a panel below the signal bars). These two augments fill
// them from RealAntennas' OWN Topics only, so CommSignal stays RA-agnostic and the
// detail appears only when RA is installed.
//
// This is where the RA integration finally RENDERS. The three RA-only channels
// (`comms.dataRate` / `comms.linkMargin` / `comms.linkQuality`) and the per-hop
// `extensions.realantennas` bag have reached the SDK end to end for a while with
// no reader; these augments are that reader.
//
// Presence-gated on `realantennas.available` via `requires: "realantennas"`: an
// install without RA never sees either augment, and CommSignal composes exactly as
// it did before.

import {
  type CommsHop,
  registerAugment,
  useTelemetry,
} from "@ksp-gonogo/sitrep-sdk";
import { Badge, Cluster, Grid, Stack, Unit, Value } from "@ksp-gonogo/ui-kit";
import { readRealAntennasHopExt } from "../hopExt";
// Side-effect import so the RA Topic registrations + the hop-bag hydration
// registration are alive wherever this augment is bundled.
import "../hopExt";

/** The vessel's own first hop, whose antenna carries the link's band/tech facts. */
function primaryHop(
  hops: readonly CommsHop[] | undefined,
): CommsHop | undefined {
  return hops && hops.length > 0 ? hops[0] : undefined;
}

const LABEL_STYLE = {
  color: "var(--color-text-dim)",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
};

/**
 * Compact header chip: band + downlink rate, e.g. "X-band" alongside "262 kbps".
 * Renders nothing until RA reports a rate, so it never shows an empty chip.
 */
function CommSignalRaBadges() {
  const dataRate = useTelemetry("comms.dataRate");
  const path = useTelemetry("comms.path");
  const ext = readRealAntennasHopExt(primaryHop(path?.hops));
  const down = dataRate?.downBitsPerSec;

  if (down === undefined && !ext?.band) return null;

  return (
    <Cluster gap="xs" align="center">
      {ext?.band ? <Badge tone="info">{ext.band}-band</Badge> : null}
      {down !== undefined ? (
        <Value size="xs" tone="muted">
          <Unit value={down} />
        </Value>
      ) : null}
    </Cluster>
  );
}

/**
 * The fuller RA panel: link margin (dB) and whether it closes, then the negotiated
 * modulation / encoder / tech level, then the reverse-direction rate. Each row
 * drops when its own field is absent, so a thin read never leaves a labelled blank.
 */
function CommSignalRaSection() {
  const margin = useTelemetry("comms.linkMargin");
  const path = useTelemetry("comms.path");
  const ext = readRealAntennasHopExt(primaryHop(path?.hops));

  const hasMargin = margin?.decibelMargin !== undefined;
  const hasExt =
    ext !== undefined &&
    (ext.techLevel != null ||
      ext.modulationBits != null ||
      !!ext.encoder ||
      ext.requiredEbN0 != null ||
      ext.beamwidth != null ||
      ext.reverseBitsPerSec != null);

  if (!hasMargin && !hasExt) return null;

  return (
    <Stack gap="xs" aria-label="RealAntennas link detail">
      <Value size="xs" tone="muted" style={LABEL_STYLE}>
        RealAntennas
      </Value>
      <Grid cols="auto 1fr" gap="md" rowGap="xs" align="baseline">
        {hasMargin ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Margin
            </Value>
            <Value
              size="sm"
              tone="default"
              style={{
                color: margin?.closesLink
                  ? "var(--color-accent-fg)"
                  : "var(--color-status-nogo-fg)",
              }}
            >
              <Unit value={margin?.decibelMargin} />
              {margin?.closesLink === false ? " (open)" : null}
            </Value>
          </>
        ) : null}
        {ext?.encoder ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Encoder
            </Value>
            <Value size="sm" tone="default">
              {ext.encoder}
            </Value>
          </>
        ) : null}
        {ext?.modulationBits != null ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Modulation
            </Value>
            <Value size="sm" tone="default">
              <Unit value={ext.modulationBits} /> bit
            </Value>
          </>
        ) : null}
        {ext?.techLevel != null ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Tech level
            </Value>
            <Value size="sm" tone="default">
              <Unit value={ext.techLevel} />
            </Value>
          </>
        ) : null}
        {ext?.requiredEbN0 != null ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Req Eb/N0
            </Value>
            <Value size="sm" tone="default">
              <Unit value={ext.requiredEbN0} />
            </Value>
          </>
        ) : null}
        {ext?.reverseBitsPerSec != null ? (
          <>
            <Value size="xs" tone="muted" style={LABEL_STYLE}>
              Uplink rate
            </Value>
            <Value size="sm" tone="default">
              <Unit value={ext.reverseBitsPerSec} />
            </Value>
          </>
        ) : null}
      </Grid>
    </Stack>
  );
}

registerAugment({
  id: "realantennas-comm-signal-badge",
  augments: "comm-signal.badges",
  requires: "realantennas",
  channels: ["comms.dataRate", "comms.path"],
  component: CommSignalRaBadges,
});

registerAugment({
  id: "realantennas-comm-signal-section",
  augments: "comm-signal.sections",
  requires: "realantennas",
  channels: ["comms.linkMargin", "comms.path"],
  component: CommSignalRaSection,
});

export { CommSignalRaBadges, CommSignalRaSection };
