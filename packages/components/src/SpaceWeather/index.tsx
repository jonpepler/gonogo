import { registerComponent, useTelemetry } from "@ksp-gonogo/core";
import {
  useStream,
  useViewUt,
  type VesselState,
} from "@ksp-gonogo/sitrep-client";
import {
  type ComponentProps,
  type KerbalismStarInfo,
  type KerbalismStormEntry,
  KerbalismStormTargetKind,
} from "@ksp-gonogo/sitrep-sdk";
import {
  Badge,
  Box,
  Card,
  Cluster,
  Countdown,
  EmptyState,
  MissionDate,
  magnitudeOf,
  Panel,
  ProgressBar,
  type ReadoutTone,
  Section,
  SectionTitle,
  type Severity,
  Stack,
  Unit,
  Value,
} from "@ksp-gonogo/ui-kit";
import styled, { css, keyframes } from "styled-components";

type SpaceWeatherConfig = Record<string, never>;

// ---------------------------------------------------------------------------
// STRICTLY sun-bound (2026-08-10 reframe). SpaceWeather used to also carry
// vessel-side radiation dose, belt membership, magnetosphere/blackout status
// and shielding: all of that is vessel-local consequence and now lives in
// ShipSystems (rate) and CrewStatus (accumulator). This widget answers only
// "what is the SUN doing": how many stars this vessel sees, and whether any
// of them has an in-transit or arrived CME. See
// local_docs/design/2026-08-10-kerbalism-solar-vantage-and-modifiers.md for
// the fair-vs-cheating boundary this reads against (StormState only, never
// storm_generation) and local_docs/design/2026-08-10-session-state-and-open-
// work.md's REFRAMED section for the placement decision itself.
//
// 2026-08-10 operator pass (per-star diagrams): activity is a per-(body,star)
// fact, so each star now gets its OWN diagram (own ring, own spike) instead
// of one diagram fusing every star's storms together. A single unified "CME
// tracker" list below still aggregates every active storm across all stars,
// that part reads fine as one list. See the target-naming note on
// `StormCard` for why a storm names either a body or a vessel.
// ---------------------------------------------------------------------------

interface SpaceWeatherData {
  stars: KerbalismStarInfo[];
  /** Every storm slot the mod reports, INCLUDING StormState 0 (none): filtered by callers. */
  storms: KerbalismStormEntry[];
  /** `PreferencesRadiation.Instance.StormEjectionSpeed`, m/s. Null until first capture. */
  stormEjectionSpeedMps: number | null;
}

function useSpaceWeather(): SpaceWeatherData {
  const t = useTelemetry("kerbalism.spaceweather");
  return {
    stars: t?.stars ?? [],
    storms: t?.storms ?? [],
    stormEjectionSpeedMps: magnitudeOf(t?.stormEjectionSpeed),
  };
}

// ---------------------------------------------------------------------------
// Storm derivation
//
// `StormState` is the ONLY discriminator read to decide a CME exists (0 none,
// 1 inbound/in-transit, 2 arrived/in-progress); `StormTime`/`StormDuration`/
// `Dist` are populated by the mod exactly when StormState is nonzero, and
// null otherwise (see KerbalismStormEntry's own doc comment on the wire
// type). `storm_generation` (the next-roll clock) is never on the wire at
// all, so there is nothing here that could peek at it even by accident.
//
// departureUt/progress are derived client-side from StormTime (arrival),
// Dist (current sun-to-body distance) and StormEjectionSpeed (global CME
// transit speed), mirroring Kerbalism's own `Time_to_impact(dist) = dist /
// StormEjectionSpeed` exactly: `departureUt = StormTime - dist/speed`. When
// Dist or the speed pref hasn't been captured yet, the storm still renders
// (state + star + impact ETA off StormTime alone), just without a transit
// bar.
// ---------------------------------------------------------------------------

interface StormDerived {
  key: string;
  star: string;
  state: number;
  /** UT the CME departed the star; null when Dist or the ejection speed isn't captured yet. */
  departureUt: number | null;
  /** 0..100, transit progress toward `dist`. Only meaningful when departureUt is set. */
  progressPct: number;
  /** stormTime - now, seconds. Negative once the CME has arrived. */
  impactEtaSec: number | null;
  /** What the CME is aimed at; null on a stream whose mod predates named targets. */
  targetKind: KerbalismStormTargetKind | null;
  /** The target's name (body or vessel, per `targetKind`); null on an older stream. */
  targetName: string | null;
}

function deriveStorm(
  entry: KerbalismStormEntry,
  index: number,
  nowUt: number,
  stormEjectionSpeedMps: number | null,
): StormDerived {
  const state = magnitudeOf(entry.stormState) ?? 0;
  const stormTime = magnitudeOf(entry.stormTime);
  const dist = magnitudeOf(entry.dist);
  const impactEtaSec = stormTime !== null ? stormTime - nowUt : null;

  let departureUt: number | null = null;
  let progressPct = 0;
  if (
    stormTime !== null &&
    dist !== null &&
    stormEjectionSpeedMps !== null &&
    stormEjectionSpeedMps > 0
  ) {
    const transitSec = dist / stormEjectionSpeedMps;
    departureUt = stormTime - transitSec;
    progressPct =
      transitSec > 0
        ? Math.max(0, Math.min(100, ((nowUt - departureUt) / transitSec) * 100))
        : 100;
  }

  return {
    key: `${entry.star ?? "star"}-${index}`,
    star: entry.star ?? "Unknown star",
    state,
    departureUt,
    progressPct,
    impactEtaSec,
    targetKind: entry.targetKind ?? null,
    targetName: entry.targetName ?? null,
  };
}

function stormSeverity(state: number): Severity {
  return state >= 2 ? "critical" : "warning";
}

function stormLabel(state: number): string {
  return state >= 2 ? "Impact" : "Inbound";
}

function overallSeverity(activeStorms: StormDerived[]): {
  severity: Severity;
  label: string;
} {
  if (activeStorms.some((s) => s.state >= 2))
    return { severity: "critical", label: "Impact" };
  if (activeStorms.length > 0) return { severity: "warning", label: "Inbound" };
  return { severity: "nominal", label: "Quiet" };
}

/** `Severity` -> `Card`'s `tone`: only the three severities this widget ever
 *  produces (nominal/warning/critical) are mapped; the rest fold to `default`
 *  defensively since `Severity` is the wider shared vocabulary. */
const SEVERITY_CARD_TONE: Record<Severity, ReadoutTone> = {
  nominal: "go",
  info: "default",
  caution: "warning",
  warning: "warning",
  critical: "alert",
  offline: "default",
};

// ---------------------------------------------------------------------------
// Deterministic noise, ported from the pre-reframe widget: a mulberry32 PRNG
// so the per-star activity ring is stable across renders/snapshots (no
// Math.random, no clock dependency). Seeded per-star (not per-widget) now,
// so each star's ring shape is stable regardless of which OTHER stars are
// also being rendered.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedForStar(name: string): number {
  let s = name.length * 101 + 1;
  for (let i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) | 0;
  return s || 1;
}

/** Point at radius `r` (SVG units) and bearing `deg` (0 = up, clockwise), centred on (50, 50). */
function pointAt(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(rad), y: 50 - r * Math.cos(rad) };
}

const TONE_HEX: Record<Severity, string> = {
  nominal: "var(--color-status-go-bg)",
  info: "var(--color-status-info-bg)",
  caution: "var(--color-status-warning-bg)",
  warning: "var(--color-status-warning-bg)",
  critical: "var(--color-status-nogo-bg)",
  offline: "var(--color-text-muted)",
};

/** Warm star colour (yellow/white), never the app's brand green: a star's
 *  own light is a colour fact, not a status accent, so it should never read
 *  as "GO". */
const STAR_FILL = "var(--color-tag-yellow-fg)";

// ---------------------------------------------------------------------------
// Per-star activity: a level in 0..1, honestly derived from whether/how-
// imminent an in-transit CME is for THIS star. 0 = no CME at all (tight,
// calm ring). Ramps toward 1 as an inbound CME's transit progress nears
// impact (mirrors `StormDerived.progressPct`, the same honest transit-
// progress figure the CME tracker cards already show). An arrived/impacting
// CME (state 2) always reads as the maximum, 1. The level drives BOTH the
// ring's look (colour/intensity/turbulence, see `ringGeometry`) and its
// distance from the star, so quiet and active are never visually
// confusable.
// ---------------------------------------------------------------------------

interface StarActivity {
  level: number;
  severity: Severity;
  /** This star's own active (nonzero-state) storms only. */
  storms: StormDerived[];
}

function starActivity(
  allStorms: StormDerived[],
  starName: string,
): StarActivity {
  const mine = allStorms.filter((s) => s.star === starName && s.state !== 0);
  if (mine.length === 0) return { level: 0, severity: "nominal", storms: [] };
  const severity: Severity = mine.some((s) => s.state >= 2)
    ? "critical"
    : "warning";
  const level = Math.max(
    ...mine.map((s) => {
      if (s.state >= 2) return 1;
      if (s.departureUt === null) return 0.5; // active but transit not yet captured
      return Math.max(0.15, Math.min(1, s.progressPct / 100));
    }),
  );
  return { level, severity, storms: mine };
}

/** Ring radius/turbulence/visual weight as a function of activity `level`
 *  (0..1): quiet stays a tight, thin, near-circular ring hugging the star;
 *  an active CME expands the ring outward and roughens it, so the two
 *  states are never near-identical. */
function ringGeometry(level: number) {
  return {
    baseR: 20 + level * 18,
    jitterAmp: 1.2 + level * 7,
    strokeWidth: 1 + level * 1.6,
    opacity: 0.4 + level * 0.5,
  };
}

function ringPathD(seed: number, level: number): string {
  const rng = mulberry32(seed);
  const { baseR, jitterAmp } = ringGeometry(level);
  const ringPoints = 28;
  let d = "";
  for (let i = 0; i <= ringPoints; i++) {
    const deg = (360 * i) / ringPoints;
    const jitter = (rng() - 0.5) * jitterAmp;
    const { x, y } = pointAt(baseR + jitter, deg);
    d += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function ringColor(level: number, severity: Severity): string {
  return level <= 0 ? "var(--color-text-muted)" : TONE_HEX[severity];
}

/** Breathing opacity pulse: the ONLY animated cue, and only ever applied to
 *  an active (level > 0) ring. Gated behind `prefers-reduced-motion` inside
 *  the same rule the animation lives in (CLAUDE.md a11y rule: wrapping only
 *  the keyframes would leave the animation running for reduced-motion
 *  users). */
const cmeRingPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
`;

const RingPath = styled.path<{ $active: boolean }>`
  ${({ $active }) =>
    $active &&
    css`
      @media (prefers-reduced-motion: no-preference) {
        animation: ${cmeRingPulse} 2.4s ease-in-out infinite;
      }
    `}
`;

// ---------------------------------------------------------------------------
// Per-star diagram: the star itself, its own activity ring, and (0 or more,
// typically 0 or 1 given the mod reports one storm slot per star) directional
// spikes for its own active storms. Direction is explicitly representational:
// Kerbalism models CME emission as radial from the source star with no
// bearing data at all, so spikes fan out at fixed, evenly-spaced angles
// rather than pointing at any real geometry. Existence of a spike is the
// honest signal; its angle is not.
// ---------------------------------------------------------------------------

function StarDiagram({
  starName,
  activity,
  compact,
}: {
  starName: string;
  activity: StarActivity;
  compact: boolean;
}) {
  const seed = seedForStar(starName);
  const d = ringPathD(seed, activity.level);
  const { strokeWidth, opacity } = ringGeometry(activity.level);
  const color = ringColor(activity.level, activity.severity);
  const label =
    activity.level <= 0
      ? `Solar activity for ${starName}: baseline`
      : `Solar activity for ${starName}: ${
          activity.severity === "critical" ? "CME impacting" : "CME inbound"
        }`;

  return (
    <Box
      style={{
        flex: "0 0 auto",
        height: compact ? 56 : 76,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        role="img"
        aria-label={label}
      >
        <RingPath
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={opacity}
          $active={activity.level > 0}
        />
        {activity.storms.map((storm, i) => {
          const count = activity.storms.length;
          const centreDeg = (360 * i) / count;
          const tip = pointAt(46, centreDeg);
          const left = pointAt(24, centreDeg - 3);
          const right = pointAt(24, centreDeg + 3);
          const fill = TONE_HEX[stormSeverity(storm.state)];
          return (
            <polygon
              key={storm.key}
              points={`${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}`}
              fill={fill}
            />
          );
        })}
        <circle cx={50} cy={50} r={14} fill={STAR_FILL} />
      </svg>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

function SpaceWeatherComponent({
  w,
  h,
}: Readonly<ComponentProps<SpaceWeatherConfig>>) {
  const d = useSpaceWeather();
  const nowUt = useViewUt() ?? 0;
  // Storm target naming: each entry names its own target (see the doc comment
  // on `StormCard` below), so this derived body name is only the fallback for
  // a stream whose mod predates that capture.
  const vesselState = useStream<VesselState>("vessel.state");
  const fallbackBodyName = vesselState?.parentBodyName ?? undefined;
  const cols = w ?? 8;
  const rows = h ?? 11;
  const compact = cols < 7 || rows < 6;

  const allStorms = d.storms.map((s, i) =>
    deriveStorm(s, i, nowUt, d.stormEjectionSpeedMps),
  );
  const activeStorms = allStorms.filter((s) => s.state !== 0);
  const status = overallSeverity(activeStorms);

  return (
    <Panel
      panelTitle="Space Weather"
      panelAside={
        <Badge role="status" aria-live="polite" severity={status.severity}>
          {status.label}
        </Badge>
      }
    >
      <Stack gap="md">
        <Section>
          <SectionTitle>Stars</SectionTitle>
          {d.stars.length === 0 ? (
            <EmptyState>No stars detected yet.</EmptyState>
          ) : (
            // `justify="start"`, not the Cluster default `between`: with only
            // one or two stars, space-between shoves the cards to opposite
            // edges of the widget with a huge gap between them, which reads
            // as broken rather than "not much going on". Packing left with a
            // fixed card width (below) is what scales sensibly from a lone
            // star up to a five-star system, wrapping onto further rows
            // instead of stretching or crowding.
            <Cluster gap="sm" wrap justify="start">
              {d.stars.map((star) => {
                const name = star.star ?? "Unknown star";
                const activity = starActivity(allStorms, name);
                return (
                  <Card
                    key={name}
                    tone={SEVERITY_CARD_TONE[activity.severity]}
                    // Fixed width, not just a minWidth: every card is the
                    // same size regardless of star-name length, so a row
                    // packs and wraps predictably instead of each card
                    // claiming whatever space its content happens to need.
                    // flexShrink 0 keeps that width honest under `wrap`
                    // (the browser wraps to a new row rather than squeezing
                    // the cards to fit).
                    style={{ width: 128, flexShrink: 0 }}
                  >
                    <Stack gap="xs">
                      <StarDiagram
                        starName={name}
                        activity={activity}
                        compact={compact}
                      />
                      <Value tone="default" weight="semibold" size="sm">
                        {name}
                      </Value>
                      <Value tone="muted" size="xs">
                        <Unit value={star.distance} />
                      </Value>
                    </Stack>
                  </Card>
                );
              })}
            </Cluster>
          )}
        </Section>

        <Section>
          <SectionTitle>CME tracker</SectionTitle>
          {activeStorms.length === 0 ? (
            <EmptyState>No inbound CMEs detected.</EmptyState>
          ) : (
            <Stack gap="sm">
              {activeStorms.map((storm) => (
                <StormCard
                  key={storm.key}
                  storm={storm}
                  compact={compact}
                  fallbackBodyName={fallbackBodyName}
                />
              ))}
            </Stack>
          )}
        </Section>
      </Stack>
    </Panel>
  );
}

/**
 * Single unified list aggregating active storms across every star, so the
 * operator has one place to see everything inbound/impacting regardless of
 * which star it came from.
 *
 * **Where the target name comes from.** Each `KerbalismStormEntry` names its
 * own target (`targetKind` + `targetName`), because Kerbalism has two storm
 * paths and they aim at different things. Around a body, the slot is the
 * shared `Storm.StormKey(body, star)` one and every vessel in that SOI sees
 * the same storm, so the body is the target. With no body SOI (solar orbit
 * or a barycenter), `Storm.Update(Vessel)` rolls per-vessel against
 * `VesselData.stormDataByStar` and that vessel's own sun distance, so the
 * VESSEL is the target and no other craft shares the storm: hence the "(this
 * vessel)" qualifier, which says the CME was aimed at this craft in deep
 * space rather than at a body it happens to be near.
 *
 * `vessel.state.parentBodyName` remains as a fallback only, for a stream
 * whose mod predates the named-target capture (contract Minor 9). A stream
 * carrying neither degrades to "current body".
 */

// ---------------------------------------------------------------------------
// Transit-progress colour: ui-kit's `ProgressBar` defaults to
// `--color-accent-fg`, the brand green used everywhere else to mean "on
// track". A CME closing in is the opposite of that: further along the bar
// means CLOSER to impact, so a plain green fill reads as reassuring for what
// is a threat. Colour is keyed on imminence instead, calm/cool while the CME
// is still far out, ramping through amber into red as `progressPct` nears
// 100, and pinned to red the instant the storm has actually arrived (state
// 2) regardless of the percentage. Uses the shared status tokens, same
// vocabulary as `TONE_HEX` above, never a raw hex literal.
// ---------------------------------------------------------------------------

function transitThreatColor(storm: StormDerived): string {
  if (storm.state >= 2) return "var(--color-status-nogo-bg)";
  if (storm.progressPct >= 66) return "var(--color-status-nogo-bg)";
  if (storm.progressPct >= 33) return "var(--color-status-warning-bg)";
  return "var(--color-status-info-fg)";
}

function StormCard({
  storm,
  compact,
  fallbackBodyName,
}: {
  storm: StormDerived;
  compact: boolean;
  fallbackBodyName: string | undefined;
}) {
  const severity = stormSeverity(storm.state);
  const target = storm.targetName ?? fallbackBodyName ?? "current body";
  const verb = storm.state >= 2 ? "Impacting" : "Inbound to";
  // Only the per-vessel case gets a qualifier: a body target reads plainly.
  const qualifier =
    storm.targetKind === KerbalismStormTargetKind.Vessel
      ? " (this vessel)"
      : "";
  const targetPhrase = `${verb} ${target}${qualifier}`;
  return (
    <Card tone={SEVERITY_CARD_TONE[severity]}>
      <Stack gap="xs">
        <Cluster justify="between" align="baseline">
          <Value tone="default" weight="semibold" size="sm">
            {storm.star}
          </Value>
          <Badge severity={severity} size="sm">
            {stormLabel(storm.state)}
          </Badge>
        </Cluster>

        <Value tone="muted" size="xs">
          {targetPhrase}
        </Value>

        {storm.departureUt !== null ? (
          <>
            {!compact && (
              <Cluster justify="between">
                <Value tone="muted" size="xs">
                  Departed
                </Value>
                <Value tone="default" size="xs">
                  <MissionDate value={storm.departureUt} />
                </Value>
              </Cluster>
            )}
            <ProgressBar
              value={storm.progressPct}
              ariaLabel={`Transit progress from ${storm.star}`}
              fillColor={transitThreatColor(storm)}
            />
          </>
        ) : (
          <Value tone="muted" size="xs">
            Transit data not yet captured.
          </Value>
        )}

        <Cluster justify="between">
          <Value tone="muted" size="xs">
            Impact
          </Value>
          <Value
            tone={storm.state >= 2 ? "nogo" : "warn"}
            size="xs"
            weight="semibold"
            // `warn` alone renders --color-status-warning-fg, a near-black
            // meant for text ON the warning "-bg" orange (e.g. inside a
            // Badge); standalone on this card's raised dark surface that is
            // functionally invisible. Same landmine ShipSystems documents
            // (LedgerBody's residual line, ResourceLedgerRow's footnote);
            // the `-fg-muted` override is the fix. `nogo`'s own `-fg` is a
            // light pink and doesn't need it.
            style={
              storm.state < 2
                ? { color: "var(--color-status-warning-fg-muted)" }
                : undefined
            }
          >
            {storm.impactEtaSec !== null ? (
              <Countdown value={storm.impactEtaSec} clock />
            ) : (
              "unknown"
            )}
          </Value>
        </Cluster>
      </Stack>
    </Card>
  );
}

registerComponent<SpaceWeatherConfig>({
  id: "space-weather",
  name: "Space Weather",
  description:
    "Sun-vantage observatory: a per-star activity diagram for every star this vessel sees, plus a unified CME tracker (departure, progress, impact ETA, and the named target: the body below, or the vessel itself out in solar orbit) derived from in-transit storm state only, never the storm RNG schedule.",
  tags: ["telemetry", "kerbalism"],
  defaultSize: { w: 8, h: 11 },
  minSize: { w: 3, h: 4 },
  component: SpaceWeatherComponent,
  channels: ["kerbalism.spaceweather"],
  defaultConfig: {},
  actions: [],
  requires: ["flight"],
});

export { SpaceWeatherComponent };
