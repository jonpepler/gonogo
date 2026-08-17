import type { ComponentProps, ConfigComponentProps } from "@ksp-gonogo/core";
import {
  AugmentSlot,
  getAugmentsForSlot,
  registerComponent,
  useContributions,
  useTelemetry,
} from "@ksp-gonogo/core";
import {
  contactPhase,
  useFleetVesselContact,
  useFleetVesselPosition,
  useFleetVesselSilence,
  useStream,
  useViewUt,
} from "@ksp-gonogo/sitrep-client";
import type { Situation, VesselType } from "@ksp-gonogo/sitrep-sdk";
import { value } from "@ksp-gonogo/sitrep-sdk";
import {
  ConfigForm,
  Field,
  FieldHint,
  FieldLabel,
  Select,
  useModalSaveBar,
} from "@ksp-gonogo/ui";
import {
  Badge,
  Cluster,
  EmptyState,
  formatDuration,
  MissionDate,
  NULL_DISPLAY,
  Panel,
  ReadoutCaption,
  Row,
  ScrollArea,
  Section,
  SectionTitle,
  Stack,
  Truncate,
  Unit,
  Value,
} from "@ksp-gonogo/ui-kit";
import {
  type CSSProperties,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react";
import { magnitudeOf, type Quantityish } from "../shared/magnitude";
import { type DeadlineAxis, deadlineAxis } from "./axis";
import { type BallisticState, ballisticState } from "./ballistic";
import { contactFacts } from "./contactFacts";
import type { TrackerDeadline, VesselTrackerDeadlineEntry } from "./deadlines";
import { trackerDeadlines } from "./deadlines";
import {
  DEADLINE_KIND_COLOUR,
  DEADLINE_KIND_LABEL,
  PHASE_LABEL,
  PHASE_SEVERITY,
  SITUATION_LABEL,
  VESSEL_TYPE_LABEL,
} from "./presentation";

/**
 * A single craft's tracking surface: what we know about THIS vessel and how
 * confident we are, as against FleetRoster's one-row-per-craft "which craft
 * need attention".
 *
 * It INFORMS. It presents facts and lets the operator draw conclusions, which
 * is the same rule GO/NO-GO already follows: the app reports state, humans make
 * the calls. So there is no verdict wording anywhere, and deliberately no
 * control to declare a craft lost, lostness is an observation about game state
 * (the deadline passed with no contact), not an opinion the operator records.
 * A button for it would turn a derived fact into a decision and immediately
 * raise the question of what happens when the game disagrees.
 */
interface VesselTrackerConfig {
  /**
   * The craft to track. `"auto"` follows the active vessel; anything else is a
   * `system.vessels` vesselId.
   *
   * A picker rather than a hard-wire to the active vessel because the widget's
   * subject is a craft you cannot see, which by definition is not the one you
   * are flying.
   */
  vesselId?: string;
}

/** Contributed entries the reachable-envelope slot will carry once anything can compute one. */
export interface VesselTrackerEnvelopeContext {
  vesselId: string;
  vesselName: string;
}

/** Contributed entries the consumables slot will carry once a life-support Uplink exists. */
export interface VesselTrackerConsumablesContext {
  vesselId: string;
  vesselName: string;
}

declare module "@ksp-gonogo/core" {
  interface SlotRegistry {
    /**
     * Where a contributed REACHABLE set renders, alongside the first-party
     * ballistic point. Nothing fills it today: bounding the volume needs the
     * delta-V the craft had at last contact, and `dv.summary` / `dv.stages` are
     * active-vessel topics, so there is no per-vessel figure to bound it with.
     */
    "vessel-tracker.envelope": VesselTrackerEnvelopeContext;
    /** Per-resource detail behind the operational deadline, for a life-support Uplink to fill. */
    "vessel-tracker.consumables": VesselTrackerConsumablesContext;
  }

  /**
   * `vessel-tracker.deadline`: an OPERATIONAL limit for a craft, contributed by
   * whatever models one (life support, power). Entries are stamped with the
   * vessel they are about and the host filters to the craft it is tracking,
   * the same shape `system-view.vessel-status` uses.
   *
   * The other two deadlines are NOT contributions. See the note above
   * `useTrackedVessel` for why.
   */
  interface ContributionRegistry {
    "vessel-tracker.deadline": {
      entry: VesselTrackerDeadlineEntry;
      topics: "system.vessels";
    };
  }
}

// ---------------------------------------------------------------------------
// Data read
// ---------------------------------------------------------------------------

interface TrackedVessel {
  id: string;
  name: string;
  type: string;
  situation: string;
  body: string | null;
}

/**
 * The craft being tracked, resolved from config against `system.vessels`.
 *
 * NOTE on why the comms deadlines are read straight off `silence.<guid>.state`
 * here rather than arriving as a contribution, which is what the spec's
 * composition section describes.
 *
 * It is NOT that a contribution cannot serve an operator-chosen subject. The
 * working pattern is to fan out over every subject and stamp each entry with
 * its `target`, letting the host filter, which is exactly what
 * `system-view.vessel-status` does.
 *
 * The obstacle is narrower and specific to this data: per-vessel silence lives
 * in a DYNAMIC topic, which no static dep can name, and the module-level bridge
 * that reaches it (`getLatestFleetVesselSilence`) only holds vessels some
 * component is ALREADY subscribed to. A fan-out contribution reading that
 * bridge would see exactly the vessels a widget had already rendered, which
 * makes it useless as the thing that feeds the widget. So this widget keeps the
 * one raw subscription until a fleet-wide aggregate silence topic exists, at
 * which point the deps become static and the contribution can fan out for real.
 *
 * The stock-game gate the spec wanted from `requires` holds meanwhile without
 * any of it: no comms domain means `silence.<guid>.state` never delivers, the
 * reckoning is undefined, and the rows report "no silence model" rather than a
 * fabricated one.
 */
function useTrackedVessel(configured: string): TrackedVessel | null {
  const system = useTelemetry("system.vessels");
  const bodies = useTelemetry("system.bodies");
  const identity = useTelemetry("vessel.identity");

  const nameByIndex = useMemo(() => {
    const m = new Map<number, string>();
    for (const b of bodies?.bodies ?? []) {
      if (b.name != null) m.set(b.index, b.name);
    }
    return m;
  }, [bodies]);

  const wanted =
    configured === "auto" || configured === ""
      ? (identity?.vesselId ?? null)
      : configured;

  return useMemo(() => {
    if (wanted == null) return null;
    const entry = (system?.vessels ?? []).find((v) => v.vesselId === wanted);
    if (!entry) return null;
    return {
      id: entry.vesselId,
      name: entry.name,
      type: VESSEL_TYPE_LABEL[entry.vesselType as VesselType] ?? "Unknown",
      situation: SITUATION_LABEL[entry.situation as Situation] ?? "Unknown",
      body:
        entry.bodyIndex != null
          ? (nameByIndex.get(entry.bodyIndex) ?? null)
          : null,
    };
  }, [system, wanted, nameByIndex]);
}

/**
 * The tracked craft's ballistic state, from `fleet.<guid>.orbit` (the whole
 * fleet's elements, published per vessel and delayed by that vessel's own
 * light-time) propagated to the view UT.
 *
 * Null until elements arrive, which is what keeps the envelope section absent
 * rather than empty. The dynamic namespace is not unit-wrapped on decode
 * (`wrapTopicPayload` keys on the exact topic string and no per-guid topic
 * matches one), so the elements arrive as bare numbers and `magnitudeOf`
 * tolerates either form.
 */
function useBallistic(guid: string): BallisticState | null {
  const raw = useStream<Record<string, Quantityish>>(`fleet.${guid}.orbit`);
  const position = useFleetVesselPosition(guid);
  const bodies = useTelemetry("system.bodies");

  return useMemo(() => {
    if (!raw) return null;
    const bodyIndex = magnitudeOf(raw.referenceBodyIndex);
    const body =
      bodyIndex == null
        ? undefined
        : bodies?.bodies.find((b) => b.index === bodyIndex);
    const radiusFromCentre = position ? Math.hypot(...position.position) : null;
    return ballisticState({
      sma: magnitudeOf(raw.sma) ?? Number.NaN,
      ecc: magnitudeOf(raw.ecc) ?? Number.NaN,
      mu: magnitudeOf(raw.mu) ?? Number.NaN,
      bodyRadius: magnitudeOf(body?.radius) ?? null,
      radiusFromCentre,
    });
  }, [raw, position, bodies]);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * A deadline as a duration from now. Past and future read differently on
 * purpose: a bare "4m" that silently means four minutes AGO is the same class
 * of invisible lie as merging the three kinds.
 */
function relativeToNow(atUt: number, nowUt: number): string {
  const delta = atUt - nowUt;
  if (delta < 0) return `${formatDuration(-delta)} ago`;
  return `in ${formatDuration(delta)}`;
}

/** Axis ordering, spoken. Without it the axis is a picture only sighted operators can read. */
function axisDescription(
  axis: DeadlineAxis,
  rows: readonly TrackerDeadline[],
): string {
  const ordered = [...axis.marks].sort((a, b) => a.atUt - b.atUt);
  const named = ordered.map((mark) => {
    const row = rows.find((r) => r.kind === mark.kind);
    return `${DEADLINE_KIND_LABEL[mark.kind].toLowerCase()} (${row?.label ?? mark.kind})`;
  });
  return `Deadline order: ${named.join(", then ")}`;
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

const CAPTION: CSSProperties = {
  fontSize: "var(--font-size-2xs)",
  color: "var(--color-text-muted)",
  letterSpacing: "0.04em",
};

const KIND_CHIP: CSSProperties = {
  fontSize: "var(--font-size-2xs)",
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

/** The kind's hue, repeated from the axis mark so a row and its mark are the same thing. */
function KindSwatch({ kind }: { kind: TrackerDeadline["kind"] }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flex: "0 0 auto",
        width: 3,
        alignSelf: "stretch",
        borderRadius: "var(--radius-xs)",
        background: DEADLINE_KIND_COLOUR[kind],
      }}
    />
  );
}

/**
 * One deadline. Everything that distinguishes it from the other two is on the
 * row itself: which kind, what runs out, whose model says so, and the basis the
 * number came from. A row that showed only a duration would be
 * indistinguishable from the other two rows showing only a duration, which is
 * the failure the whole widget is arranged around.
 */
function DeadlineRow({ row, nowUt }: { row: TrackerDeadline; nowUt: number }) {
  return (
    <Row as="li" style={{ alignItems: "stretch", gap: "var(--space-8)" }}>
      <Cluster
        justify="start"
        style={{
          gap: "var(--space-6)",
          minWidth: 0,
          // The kind swatch is a full-height rule down the row's left edge, so
          // it has to stretch rather than centre on the first line.
          alignItems: "stretch",
        }}
      >
        <KindSwatch kind={row.kind} />
        <Stack gap="xs" style={{ minWidth: 0 }}>
          <Cluster align="baseline" style={{ gap: "var(--space-6)" }}>
            <span
              style={{ ...KIND_CHIP, color: DEADLINE_KIND_COLOUR[row.kind] }}
            >
              {DEADLINE_KIND_LABEL[row.kind]}
            </span>
            <Truncate
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-primary)",
              }}
            >
              {row.label}
            </Truncate>
          </Cluster>
          <span style={CAPTION}>
            {row.question} · {row.owner}
          </span>
          <span style={CAPTION}>basis: {row.basis}</span>
        </Stack>
      </Cluster>
      <Stack gap="xs" style={{ alignItems: "flex-end", flex: "0 0 auto" }}>
        <Value tone="default" size="sm" style={{ whiteSpace: "nowrap" }}>
          {row.atUt == null ? NULL_DISPLAY : relativeToNow(row.atUt, nowUt)}
        </Value>
        {row.atUt != null && (
          <span style={{ ...CAPTION, whiteSpace: "nowrap" }}>
            <MissionDate value={row.atUt} />
          </span>
        )}
      </Stack>
    </Row>
  );
}

/**
 * The three deadlines on one scale, which is the only place their relative
 * order is visible at a glance. It shows the ordering and stops there; whether
 * an operational limit falling before a geometric return is a problem is the
 * operator's reading, not the widget's.
 */
function DeadlineAxisBar({
  axis,
  rows,
}: {
  axis: DeadlineAxis;
  rows: readonly TrackerDeadline[];
}) {
  const pct = (f: number) => `${(f * 100).toFixed(2)}%`;
  return (
    <div
      role="img"
      aria-label={axisDescription(axis, rows)}
      style={{
        position: "relative",
        height: 18,
        margin: "var(--space-6) 0",
        flex: "0 0 auto",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 8,
          height: 1,
          background: "var(--color-border-subtle)",
        }}
      />
      <span
        aria-hidden="true"
        title="now"
        style={{
          position: "absolute",
          left: pct(axis.nowFraction),
          top: 3,
          width: 1,
          height: 11,
          background: "var(--color-text-muted)",
        }}
      />
      {axis.marks.map((mark) => (
        <span
          key={mark.kind}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: pct(mark.fraction),
            top: 5,
            marginLeft: -3,
            width: 7,
            height: 7,
            borderRadius: "var(--radius-circle)",
            background: DEADLINE_KIND_COLOUR[mark.kind],
          }}
        />
      ))}
    </div>
  );
}

/**
 * The craft's contact state, announced only as far as each state warrants: a
 * declared loss interrupts, going overdue is polite, and the states that change
 * every tick are not announced at all, because a live region would read a
 * running countdown aloud indefinitely.
 */
function PhaseBadge({
  phase,
  vesselName,
}: {
  phase: ReturnType<typeof contactPhase>;
  vesselName: string;
}) {
  if (!phase) return <Badge severity="offline">No contact model</Badge>;

  const label = PHASE_LABEL[phase];
  if (phase === "lost") {
    return (
      <Badge severity="critical" role="alert" aria-live="assertive">
        <span style={{ textDecoration: "line-through" }}>{vesselName}</span>{" "}
        {label.toLowerCase()}
      </Badge>
    );
  }
  if (phase === "overdue") {
    return (
      <Badge severity="warning" role="status" aria-live="polite">
        {label}
      </Badge>
    );
  }
  return <Badge severity={PHASE_SEVERITY[phase]}>{label}</Badge>;
}

/**
 * The innermost part of the envelope: where the craft is having done nothing.
 *
 * Losing contact does not make a position unknown, it makes it known with a
 * growing envelope, and this is only the point at the middle of one. The
 * reachable volume around it needs the delta-V the craft had at last contact,
 * which is not published for a craft that is not being flown, so the widget
 * says that outright instead of drawing the point and calling it the envelope.
 */
function BallisticFacts({ state }: { state: BallisticState }) {
  const metres = (m: number | null) =>
    m == null ? NULL_DISPLAY : <Unit value={value("m", m)} />;
  return (
    <>
      <ReadoutCaption>
        ballistic point: where it is if it did not manoeuvre, propagated from
        the last elements received
      </ReadoutCaption>
      <ul style={LIST}>
        <Fact label="Altitude" value={metres(state.altitude)} />
        <Fact label="Apoapsis" value={metres(state.apoapsis)} />
        <Fact label="Periapsis" value={metres(state.periapsis)} />
        <Fact
          label="Period"
          value={
            state.periodSeconds == null
              ? NULL_DISPLAY
              : formatDuration(state.periodSeconds)
          }
        />
        <Fact label="Reachable volume" value="no delta-V for a dark craft" />
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

function VesselTrackerComponent({
  config,
}: Readonly<ComponentProps<VesselTrackerConfig>>) {
  const identityId = useId();
  const contactId = useId();
  const deadlinesId = useId();
  const envelopeId = useId();

  const vessel = useTrackedVessel(config?.vesselId ?? "auto");
  const guid = vessel?.id ?? "";
  const nowUt = useViewUt() ?? 0;

  // Both dynamic per-vessel topics, kept subscribed by this widget for as long
  // as it is tracking the craft.
  const contact = useFleetVesselContact(guid);
  const silence = useFleetVesselSilence(guid);
  const ballistic = useBallistic(guid);

  const contributed = useContributions("vessel-tracker.deadline");
  const operational = useMemo(
    () => contributed.filter((e) => e.target === guid),
    [contributed, guid],
  );

  const facts = contactFacts(contact, silence, nowUt);
  const phase = contactPhase(silence, nowUt);
  const rows = trackerDeadlines(silence, operational);
  const axis = deadlineAxis(rows, nowUt);

  // Non-reactive reads: augments register at module load, before first render.
  const hasEnvelope = getAugmentsForSlot("vessel-tracker.envelope").length > 0;
  const hasConsumables =
    getAugmentsForSlot("vessel-tracker.consumables").length > 0;

  if (!vessel) {
    return (
      <Panel panelTitle="Vessel Tracker">
        <EmptyState layout="fill">
          No vessel to track yet. Pick one in this widget's settings, or fly a
          craft.
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel
      panelTitle="Vessel Tracker"
      panelAside={<PhaseBadge phase={phase} vesselName={vessel.name} />}
    >
      <ScrollArea>
        <Stack gap="md" style={{ gap: "var(--space-12)" }}>
          <Section as="section" aria-labelledby={identityId}>
            <SectionTitle as="h3" id={identityId}>
              Identity
            </SectionTitle>
            <ul style={LIST}>
              <Fact label="Vessel" value={vessel.name} />
              <Fact label="Type" value={vessel.type} />
              <Fact label="Body" value={vessel.body ?? NULL_DISPLAY} />
              <Fact label="Situation" value={vessel.situation} />
            </ul>
          </Section>

          <Section as="section" aria-labelledby={contactId}>
            <SectionTitle as="h3" id={contactId}>
              Contact
            </SectionTitle>
            <ul style={LIST}>
              <Fact
                label="Link"
                value={
                  facts.connected == null
                    ? NULL_DISPLAY
                    : facts.connected
                      ? "connected"
                      : "no path"
                }
              />
              <Fact
                label="Last heard"
                value={
                  facts.lastContactUt == null ? (
                    "never"
                  ) : (
                    <>
                      <MissionDate value={facts.lastContactUt} />
                      {facts.sinceLastContact != null && (
                        <span style={CAPTION}>
                          {" "}
                          ({formatDuration(facts.sinceLastContact)} ago)
                        </span>
                      )}
                    </>
                  )
                }
              />
              {facts.silenceElapsed != null && (
                <Fact
                  label="Silent for"
                  value={formatDuration(facts.silenceElapsed)}
                />
              )}
            </ul>
          </Section>

          <Section as="section" aria-labelledby={deadlinesId}>
            <SectionTitle as="h3" id={deadlinesId}>
              Deadlines
            </SectionTitle>
            <ReadoutCaption>
              three different clocks, not three views of one
            </ReadoutCaption>
            {axis && <DeadlineAxisBar axis={axis} rows={rows} />}
            <ul style={LIST}>
              {rows.map((row) => (
                <DeadlineRow key={row.kind} row={row} nowUt={nowUt} />
              ))}
            </ul>
          </Section>

          {/* These sections render nothing at all, heading included, until
              something fills them: an empty section with a title is a promise
              the widget cannot keep. This is the opposite call from the
              deadline rows above, and deliberately so: a COMPARISON with a
              silently missing member misleads, because the reader assumes the
              set is complete, whereas a section that is simply not there makes
              no claim either way. */}
          {(ballistic || hasEnvelope) && (
            <Section as="section" aria-labelledby={envelopeId}>
              <SectionTitle as="h3" id={envelopeId}>
                Envelope
              </SectionTitle>
              {ballistic && <BallisticFacts state={ballistic} />}
              {hasEnvelope && (
                <AugmentSlot
                  name="vessel-tracker.envelope"
                  props={{ vesselId: vessel.id, vesselName: vessel.name }}
                />
              )}
            </Section>
          )}
          {hasConsumables && (
            <Section as="section">
              <SectionTitle as="h3">Consumables</SectionTitle>
              <AugmentSlot
                name="vessel-tracker.consumables"
                props={{ vesselId: vessel.id, vesselName: vessel.name }}
              />
            </Section>
          )}
        </Stack>
      </ScrollArea>
    </Panel>
  );
}

const LIST: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-2)",
};

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Row as="li">
      <Row.Name style={{ color: "var(--color-text-muted)" }}>{label}</Row.Name>
      <Value tone="default" size="sm" style={{ textAlign: "right" }}>
        {value}
      </Value>
    </Row>
  );
}

// ── Config ────────────────────────────────────────────────────────────────────

function VesselTrackerConfigComponent({
  config,
  onSave,
}: Readonly<ConfigComponentProps<VesselTrackerConfig>>) {
  const system = useTelemetry("system.vessels");
  const [vesselId, setVesselId] = useState(config?.vesselId ?? "auto");
  const candidate = useMemo<VesselTrackerConfig>(
    () => ({ vesselId }),
    [vesselId],
  );

  useModalSaveBar({
    onSave: () => onSave(candidate),
    value: candidate,
    saved: config ?? {},
  });

  return (
    <ConfigForm>
      <Field>
        <FieldLabel htmlFor="vessel-tracker-vessel">Vessel</FieldLabel>
        <Select
          id="vessel-tracker-vessel"
          value={vesselId}
          onChange={(e) => setVesselId(e.target.value)}
        >
          <option value="auto">Auto (the craft being flown)</option>
          {(system?.vessels ?? []).map((v) => (
            <option key={v.vesselId} value={v.vesselId}>
              {v.name}
            </option>
          ))}
        </Select>
        <FieldHint>
          Pin a craft to keep tracking it after you switch away. "Auto" follows
          whatever you are flying, which is the one craft you can already see.
        </FieldHint>
      </Field>
    </ConfigForm>
  );
}

registerComponent<VesselTrackerConfig>({
  id: "vessel-tracker",
  name: "Vessel Tracker",
  description:
    "One craft's tracking surface: identity and contact state, when it was last heard, how long it has been quiet, and the three separate deadlines running on it (when the radio path reopens, how long it can keep going, and when the game stops counting it as in contact) on a shared axis so their order is visible. Reports state only: it makes no judgement about a craft and offers no control to declare one lost. The reachable-envelope and consumables sections render only when an Uplink fills them; neither has data on the wire today.",
  tags: ["telemetry", "comms"],
  defaultSize: { w: 6, h: 12 },
  minSize: { w: 4, h: 6 },
  component: VesselTrackerComponent,
  configComponent: VesselTrackerConfigComponent,
  augmentSlots: ["vessel-tracker.envelope", "vessel-tracker.consumables"],
  contributionSlots: ["vessel-tracker.deadline"],
  dataRequirements: [],
  optionalChannels: ["system.vessels", "system.bodies", "vessel.identity"],
  defaultConfig: { vesselId: "auto" },
  actions: [],
  requires: ["flight"],
});

export type { VesselTrackerConfig };
export { VesselTrackerComponent };
