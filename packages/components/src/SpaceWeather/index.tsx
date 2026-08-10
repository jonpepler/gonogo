import { registerComponent, useTelemetry } from "@ksp-gonogo/core";
import { useViewUt } from "@ksp-gonogo/sitrep-client";
import type {
  ComponentProps,
  KerbalismStarInfo,
  KerbalismStormEntry,
} from "@ksp-gonogo/sitrep-sdk";
import {
  Badge,
  Box,
  Cluster,
  Countdown,
  EmptyState,
  MissionDate,
  magnitudeOf,
  Panel,
  ProgressBar,
  Section,
  SectionTitle,
  type Severity,
  Stack,
  Unit,
  Value,
} from "@ksp-gonogo/ui-kit";

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

// ---------------------------------------------------------------------------
// Deterministic noise, ported from the pre-reframe widget: a mulberry32 PRNG
// so the baseline-activity ring is stable across renders/snapshots (no
// Math.random, no clock dependency).
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

function seedFor(stars: KerbalismStarInfo[]): number {
  let s = stars.length * 101;
  for (const star of stars) {
    const name = star.star ?? "";
    for (let i = 0; i < name.length; i++) s = (s * 31 + name.charCodeAt(i)) | 0;
  }
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

// ---------------------------------------------------------------------------
// Sun render: the sun, a representational noise ring standing in for
// baseline solar activity (no live activity-index field exists on the
// wire), and one directional spike per in-transit/arrived storm. Direction
// is explicitly representational: Kerbalism models CME emission as radial
// from the source star with no bearing data at all (see the design doc's Q4
// finding), so spikes are fanned out at fixed, evenly-spaced angles rather
// than pointed at any real geometry. Existence of a spike is the honest
// signal; its angle is not.
// ---------------------------------------------------------------------------

function SunObservatory({
  stars,
  activeStorms,
}: {
  stars: KerbalismStarInfo[];
  activeStorms: StormDerived[];
}) {
  const rng = mulberry32(seedFor(stars));
  const ringPoints = 28;
  const baseR = 30;
  let ring = "";
  for (let i = 0; i <= ringPoints; i++) {
    const deg = (360 * i) / ringPoints;
    const jitter = (rng() - 0.5) * 4;
    const { x, y } = pointAt(baseR + jitter, deg);
    ring += `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  ring += "Z";

  const label =
    activeStorms.length === 0
      ? "Solar activity: baseline"
      : `Solar activity: ${activeStorms.length} CME${activeStorms.length > 1 ? "s" : ""} ${activeStorms.some((s) => s.state >= 2) ? "impacting" : "inbound"}`;

  return (
    <Box
      style={{
        flex: "0 0 auto",
        height: 96,
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
        <path
          d={ring}
          fill="none"
          stroke="var(--color-text-muted)"
          strokeWidth={1}
          opacity={0.45}
        />
        {activeStorms.map((storm, i) => {
          const count = activeStorms.length;
          const centreDeg = (360 * i) / count;
          const tip = pointAt(48, centreDeg);
          const left = pointAt(26, centreDeg - 3);
          const right = pointAt(26, centreDeg + 3);
          const fill = TONE_HEX[stormSeverity(storm.state)];
          return (
            <polygon
              key={storm.key}
              points={`${left.x},${left.y} ${tip.x},${tip.y} ${right.x},${right.y}`}
              fill={fill}
            />
          );
        })}
        <circle cx={50} cy={50} r={14} fill="var(--color-accent-fg)" />
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
        <SunObservatory stars={d.stars} activeStorms={activeStorms} />

        <Section>
          <SectionTitle>Stars</SectionTitle>
          {d.stars.length === 0 ? (
            <EmptyState>No stars detected yet.</EmptyState>
          ) : (
            <Cluster gap="sm" wrap>
              {d.stars.map((star) => (
                <StarCard key={star.star} star={star} />
              ))}
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
                <StormCard key={storm.key} storm={storm} compact={compact} />
              ))}
            </Stack>
          )}
        </Section>
      </Stack>
    </Panel>
  );
}

function StarCard({ star }: { star: KerbalismStarInfo }) {
  return (
    <Box surface="raised" pad="sm" radius="sm" style={{ minWidth: 96 }}>
      <Stack gap="xs">
        <Value tone="default" weight="semibold" size="sm">
          {star.star ?? "Unknown star"}
        </Value>
        <Value tone="muted" size="xs">
          <Unit value={star.distance} />
        </Value>
      </Stack>
    </Box>
  );
}

function StormCard({
  storm,
  compact,
}: {
  storm: StormDerived;
  compact: boolean;
}) {
  return (
    <Box surface="raised" pad="sm" radius="sm">
      <Stack gap="xs">
        <Cluster justify="between" align="baseline">
          <Value tone="default" weight="semibold" size="sm">
            {storm.star}
          </Value>
          <Badge severity={stormSeverity(storm.state)} size="sm">
            {stormLabel(storm.state)}
          </Badge>
        </Cluster>

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
    </Box>
  );
}

registerComponent<SpaceWeatherConfig>({
  id: "space-weather",
  name: "Space Weather",
  description:
    "Sun-vantage observatory: every star this vessel sees, CME transit tracking (departure, progress, impact ETA) derived from in-transit storm state only, never the storm RNG schedule.",
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
