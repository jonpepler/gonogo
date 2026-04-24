import type { ActionDefinition, ComponentProps } from "@gonogo/core";
import {
  type CurrentOrbit,
  circularizeAtApo,
  circularizeAtPeri,
  customAtApsis,
  customAtUT,
  formatDistance,
  formatDuration,
  getBody,
  gravParameterFromState,
  type ManeuverPlan,
  matchInclination,
  matchTargetPlane,
  registerComponent,
  stateAtUT,
  useDataValue,
  useExecuteAction,
} from "@gonogo/core";
import {
  type ParsedManeuverNode,
  useManeuverNodes,
  useVesselDeltaV,
} from "@gonogo/data";
import { Button, Panel, PanelSubtitle, PanelTitle } from "@gonogo/ui";
import { useMemo, useState } from "react";
import styled from "styled-components";
import { OrbitDiagram } from "../shared/OrbitDiagram";

// ---------------------------------------------------------------------------
// Config + types
// ---------------------------------------------------------------------------

type PresetId =
  | "circularize-apo"
  | "circularize-peri"
  | "custom-apo"
  | "custom-peri"
  | "custom-ut"
  | "match-inclination"
  | "match-target-inclination"
  | "match-target-plane";

interface ManeuverPlannerConfig {
  defaultPreset?: PresetId;
}

// Actions are stubbed at [] for now — the widget is mouse-driven. Hardware
// bindings (commit from a physical button) can be added later.
const maneuverActions = [] as const satisfies readonly ActionDefinition[];

// Telemachus occasionally sends null / NaN for an orbit value that KSP
// hasn't computed yet (landed vessel, fresh scene load). Treat those as
// "not yet arrived" rather than propagating them into the math.
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const PRESETS: Array<{
  id: PresetId;
  label: string;
  description: string;
  needsCustomInput: boolean;
}> = [
  {
    id: "circularize-apo",
    label: "Circularise at Apoapsis",
    description: "Prograde burn at apo to flatten eccentricity.",
    needsCustomInput: false,
  },
  {
    id: "circularize-peri",
    label: "Circularise at Periapsis",
    description: "Brake at peri to flatten eccentricity.",
    needsCustomInput: false,
  },
  {
    id: "custom-apo",
    label: "Custom burn at Apoapsis",
    description: "Set your own prograde / normal / radial ΔV at next apo.",
    needsCustomInput: true,
  },
  {
    id: "custom-peri",
    label: "Custom burn at Periapsis",
    description: "Set your own prograde / normal / radial ΔV at next peri.",
    needsCustomInput: true,
  },
  {
    id: "custom-ut",
    label: "Custom burn at UT",
    description:
      "Schedule a ΔV at an arbitrary time from now. Projection reflects real flight-path angle at the burn point.",
    needsCustomInput: true,
  },
  {
    id: "match-inclination",
    label: "Match inclination",
    description:
      "Rotate the orbital plane to a target inclination at the next AN / DN.",
    needsCustomInput: true,
  },
  {
    id: "match-target-inclination",
    label: "Match target inclination",
    description:
      "Rotate to match the current target's inclination. Needs a target selected in-game.",
    needsCustomInput: false,
  },
  {
    id: "match-target-plane",
    label: "Match target plane",
    description:
      "Full plane match — both inclination and LAN — at the relative-plane intersection. Needs a target.",
    needsCustomInput: false,
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ManeuverPlannerComponent({
  config,
}: Readonly<ComponentProps<ManeuverPlannerConfig>>) {
  const [preset, setPreset] = useState<PresetId>(
    config?.defaultPreset ?? "circularize-apo",
  );
  const [prograde, setPrograde] = useState(0);
  const [normal, setNormal] = useState(0);
  const [radial, setRadial] = useState(0);
  // "Burn in N seconds" input for the custom-ut preset. Default 60s so the
  // UI always has a sensible future UT even before the user touches it.
  const [burnInSeconds, setBurnInSeconds] = useState(60);
  // "relative" → burnInSeconds from now; "absolute" → burnAtUT as entered.
  const [utMode, setUtMode] = useState<"relative" | "absolute">("relative");
  const [burnAtUT, setBurnAtUT] = useState(0);
  // Target inclination for the match-inclination preset (°).
  const [targetInclination, setTargetInclination] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live orbit state — everything we need for the preset math + preview.
  const sma = useDataValue("data", "o.sma");
  const ecc = useDataValue("data", "o.eccentricity");
  const ApR = useDataValue("data", "o.ApR");
  const PeR = useDataValue("data", "o.PeR");
  const argPe = useDataValue("data", "o.argumentOfPeriapsis");
  const trueAnomaly = useDataValue("data", "o.trueAnomaly");
  const timeToAp = useDataValue("data", "o.timeToAp");
  const timeToPe = useDataValue("data", "o.timeToPe");
  const currentUT = useDataValue("data", "t.universalTime");
  const orbitalSpeed = useDataValue("data", "o.orbitalSpeed");
  const radius = useDataValue("data", "o.radius");
  const physicsMode = useDataValue("data", "a.physicsMode");
  const refBody = useDataValue("data", "o.referenceBody");
  const bodyName = useDataValue("data", "v.body");
  const inclination = useDataValue("data", "o.inclination");
  const targetName = useDataValue("data", "tar.name");
  const targetInclinationLive = useDataValue("data", "tar.o.inclination");
  const targetLanLive = useDataValue("data", "tar.o.lan");
  const lan = useDataValue("data", "o.lan");

  const period = useDataValue("data", "o.period");

  const nodes = useManeuverNodes();
  const vesselDeltaV = useVesselDeltaV();
  const execute = useExecuteAction("data");

  const principia = physicsMode === "n_body";
  const body = getBody(bodyName ?? refBody ?? "");

  // μ from live telemetry. Primary: vis-viva (v²·a·r / (2a−r)). Fallback:
  // Kepler's 3rd (4π²a³/T²), useful when orbital speed / radius are still
  // ramping up at scene load. Both pure telemetry — no body-registry μ.
  const mu = useMemo(() => {
    const viaVisViva =
      isFiniteNumber(orbitalSpeed) &&
      isFiniteNumber(radius) &&
      isFiniteNumber(sma) &&
      orbitalSpeed > 0 &&
      sma > 0
        ? gravParameterFromState(orbitalSpeed, radius, sma)
        : 0;
    if (viaVisViva > 0) return viaVisViva;
    if (isFiniteNumber(period) && isFiniteNumber(sma) && period > 0) {
      return (4 * Math.PI * Math.PI * sma ** 3) / (period * period);
    }
    return 0;
  }, [orbitalSpeed, radius, sma, period]);

  const currentOrbit: CurrentOrbit | null =
    isFiniteNumber(sma) &&
    isFiniteNumber(ecc) &&
    isFiniteNumber(ApR) &&
    isFiniteNumber(PeR) &&
    isFiniteNumber(timeToAp) &&
    isFiniteNumber(timeToPe)
      ? { sma, eccentricity: ecc, ApR, PeR, timeToAp, timeToPe }
      : null;

  const plan: ManeuverPlan | null = useMemo(() => {
    if (!currentOrbit || currentUT === undefined || mu <= 0) return null;
    switch (preset) {
      case "circularize-apo":
        return circularizeAtApo(currentOrbit, mu, currentUT);
      case "circularize-peri":
        return circularizeAtPeri(currentOrbit, mu, currentUT);
      case "custom-apo":
        return customAtApsis(
          currentOrbit,
          mu,
          currentUT,
          "apo",
          prograde,
          normal,
          radial,
        );
      case "custom-peri":
        return customAtApsis(
          currentOrbit,
          mu,
          currentUT,
          "peri",
          prograde,
          normal,
          radial,
        );
      case "custom-ut": {
        if (trueAnomaly === undefined) return null;
        const burnUT =
          utMode === "absolute"
            ? burnAtUT
            : currentUT + Math.max(0, burnInSeconds);
        return customAtUT(
          currentOrbit,
          trueAnomaly,
          mu,
          currentUT,
          burnUT,
          prograde,
          normal,
          radial,
        );
      }
      case "match-inclination":
        if (
          trueAnomaly === undefined ||
          argPe === undefined ||
          inclination === undefined
        )
          return null;
        return matchInclination(
          currentOrbit,
          trueAnomaly,
          argPe,
          inclination,
          mu,
          currentUT,
          targetInclination,
        );
      case "match-target-inclination":
        if (
          trueAnomaly === undefined ||
          argPe === undefined ||
          inclination === undefined ||
          targetInclinationLive === undefined
        )
          return null;
        return matchInclination(
          currentOrbit,
          trueAnomaly,
          argPe,
          inclination,
          mu,
          currentUT,
          targetInclinationLive,
        );
      case "match-target-plane":
        if (
          trueAnomaly === undefined ||
          argPe === undefined ||
          inclination === undefined ||
          lan === undefined ||
          targetInclinationLive === undefined ||
          targetLanLive === undefined
        )
          return null;
        return matchTargetPlane(
          currentOrbit,
          trueAnomaly,
          argPe,
          inclination,
          lan,
          targetInclinationLive,
          targetLanLive,
          mu,
          currentUT,
        );
    }
  }, [
    currentOrbit,
    mu,
    currentUT,
    preset,
    prograde,
    normal,
    radial,
    burnInSeconds,
    utMode,
    burnAtUT,
    trueAnomaly,
    argPe,
    inclination,
    targetInclination,
    targetInclinationLive,
    targetLanLive,
    lan,
  ]);

  const feasible =
    plan === null || vesselDeltaV.totalVac === 0
      ? null
      : vesselDeltaV.totalVac >= plan.requiredDeltaV;

  // True anomaly at the burn, for drag-handle placement on the preview.
  // Apsis presets are exact (0° / 180°); custom-ut re-uses our propagator.
  const burnTrueAnomaly: number | null = useMemo(() => {
    if (!currentOrbit || currentUT === undefined || mu <= 0) return null;
    if (preset === "custom-apo") return 180;
    if (preset === "custom-peri") return 0;
    if (preset === "custom-ut") {
      if (trueAnomaly === undefined) return null;
      const burnUT =
        utMode === "absolute"
          ? burnAtUT
          : currentUT + Math.max(0, burnInSeconds);
      if (burnUT <= currentUT) return null;
      return stateAtUT(currentOrbit, trueAnomaly, mu, currentUT, burnUT)
        .trueAnomalyDeg;
    }
    return null;
  }, [
    preset,
    currentOrbit,
    currentUT,
    mu,
    trueAnomaly,
    utMode,
    burnAtUT,
    burnInSeconds,
  ]);

  async function handleCommit() {
    if (!plan) return;
    if (principia) return;
    setCommitting(true);
    setError(null);
    try {
      // Telemachus Reborn uses `[ut,x,y,z]` args on the action key. Each
      // component in the vector is the prograde/normal/radial ΔV in the
      // node's local frame (m/s).
      const action = `o.addManeuverNode[${plan.ut.toFixed(3)},${plan.prograde.toFixed(3)},${plan.normal.toFixed(3)},${plan.radial.toFixed(3)}]`;
      await execute(action);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      await execute(`o.removeManeuverNode[${id}]`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleClearAll() {
    // Remove from the highest index down — removing index 0 first would
    // shift every subsequent id and break the loop.
    for (let i = nodes.length - 1; i >= 0; i--) {
      await execute(`o.removeManeuverNode[${i}]`);
    }
  }

  const selectedPreset = PRESETS.find((p) => p.id === preset);

  // Per-field "is this telemetry ready?" map. Feeds the diagnostic
  // waiting panel — a generic "Waiting for telemetry…" with no detail
  // left us blind the first time it triggered, and real Telemachus
  // data can land values as null / NaN mid-scene-load that wouldn't
  // look "missing" to a simple `=== undefined` check.
  const telemetryStatus: Array<{ label: string; ok: boolean }> = [
    { label: "o.sma", ok: isFiniteNumber(sma) },
    { label: "o.eccentricity", ok: isFiniteNumber(ecc) },
    { label: "o.ApR / o.PeR", ok: isFiniteNumber(ApR) && isFiniteNumber(PeR) },
    {
      label: "o.timeToAp / o.timeToPe",
      ok: isFiniteNumber(timeToAp) && isFiniteNumber(timeToPe),
    },
    { label: "t.universalTime", ok: isFiniteNumber(currentUT) },
    { label: "μ (orbitalSpeed×radius or period)", ok: mu > 0 },
  ];
  const waiting = telemetryStatus.some((s) => !s.ok);

  return (
    <Panel>
      <PanelTitle>MANEUVER PLANNER</PanelTitle>
      {refBody !== undefined && <PanelSubtitle>{refBody}</PanelSubtitle>}

      {principia && (
        <PrincipiaBanner>
          N-body physics detected — impulsive maneuver nodes are unsupported
          under Principia. Commit disabled.
        </PrincipiaBanner>
      )}

      <Section>
        <SectionTitle>Planned nodes</SectionTitle>
        {nodes.length === 0 ? (
          <Empty>No maneuver nodes planned.</Empty>
        ) : (
          <NodeList>
            {nodes.map((n) => (
              <NodeRow
                key={n.id}
                node={n}
                currentUT={currentUT}
                availableDv={vesselDeltaV.totalVac}
                onDelete={() => void handleDelete(n.id)}
              />
            ))}
          </NodeList>
        )}
        {nodes.length > 1 && (
          <ClearAllRow>
            <GhostLink type="button" onClick={() => void handleClearAll()}>
              Clear all
            </GhostLink>
          </ClearAllRow>
        )}
      </Section>

      <Section>
        <SectionTitle>New maneuver</SectionTitle>
        <PresetPicker
          value={preset}
          onChange={(next) => {
            setPreset(next);
            if (!PRESETS.find((p) => p.id === next)?.needsCustomInput) {
              setPrograde(0);
              setNormal(0);
              setRadial(0);
            }
          }}
        />
        {selectedPreset?.description && (
          <PresetDesc>{selectedPreset.description}</PresetDesc>
        )}
        {selectedPreset?.needsCustomInput &&
          (preset === "match-inclination" ? (
            <CustomInputs>
              <LabeledInput
                label="Target inc"
                value={targetInclination}
                onChange={setTargetInclination}
                suffix="°"
              />
            </CustomInputs>
          ) : (
            <CustomInputs>
              {preset === "custom-ut" && (
                <>
                  <UTModeRow>
                    <UTModeButton
                      $active={utMode === "relative"}
                      type="button"
                      onClick={() => setUtMode("relative")}
                    >
                      burn in
                    </UTModeButton>
                    <UTModeButton
                      $active={utMode === "absolute"}
                      type="button"
                      onClick={() => {
                        // Seed the absolute field with "now + 60s" the first
                        // time the user flips modes, so they don't see a 0.
                        if (burnAtUT === 0 && currentUT !== undefined) {
                          setBurnAtUT(currentUT + 60);
                        }
                        setUtMode("absolute");
                      }}
                    >
                      at UT
                    </UTModeButton>
                  </UTModeRow>
                  {utMode === "relative" ? (
                    <LabeledInput
                      label="Burn in"
                      value={burnInSeconds}
                      onChange={setBurnInSeconds}
                      suffix="s"
                    />
                  ) : (
                    <LabeledInput
                      label="At UT"
                      value={burnAtUT}
                      onChange={setBurnAtUT}
                      suffix=""
                    />
                  )}
                </>
              )}
              <LabeledInput
                label="Prograde"
                value={prograde}
                onChange={setPrograde}
              />
              <LabeledInput
                label="Normal"
                value={normal}
                onChange={setNormal}
              />
              <LabeledInput
                label="Radial"
                value={radial}
                onChange={setRadial}
              />
            </CustomInputs>
          ))}
        {preset === "match-target-inclination" && (
          <PresetDesc>
            {targetName
              ? `Target: ${targetName} (${(targetInclinationLive ?? 0).toFixed(1)}°)`
              : "No target selected in-game."}
          </PresetDesc>
        )}
        {preset === "match-target-plane" && (
          <PresetDesc>
            {targetName && targetLanLive !== undefined
              ? `Target: ${targetName} — i=${(targetInclinationLive ?? 0).toFixed(1)}° Ω=${targetLanLive.toFixed(1)}°`
              : "No target selected in-game (or target LAN unavailable)."}
          </PresetDesc>
        )}
      </Section>

      {waiting ? (
        <WaitingPanel>
          <SectionTitle>Waiting for telemetry</SectionTitle>
          <StatusList>
            {telemetryStatus.map((s) => (
              <StatusRow key={s.label}>
                <StatusDot $ok={s.ok}>{s.ok ? "✓" : "·"}</StatusDot>
                <StatusLabel>{s.label}</StatusLabel>
              </StatusRow>
            ))}
          </StatusList>
        </WaitingPanel>
      ) : (
        plan && (
          <PreviewSection>
            <SectionTitle>Preview</SectionTitle>
            <PreviewGrid>
              <Label>ΔV</Label>
              <Value>{plan.requiredDeltaV.toFixed(1)} m/s</Value>

              <Label>Burn in</Label>
              <Value>{formatDuration(plan.ut - (currentUT ?? 0))}</Value>

              <Label>Available</Label>
              <Value>
                {vesselDeltaV.totalVac === 0
                  ? "—"
                  : `${vesselDeltaV.totalVac.toFixed(0)} m/s`}
                {feasible !== null && (
                  <FeasibilityChip $ok={feasible}>
                    {feasible ? "OK" : "SHORT"}
                  </FeasibilityChip>
                )}
              </Value>

              {plan.projected ? (
                <>
                  <Label>New Ap</Label>
                  <Value $accent="ap">
                    {formatDistance(plan.projected.ApR - (body?.radius ?? 0))}
                  </Value>

                  <Label>New Pe</Label>
                  <Value $accent="pe">
                    {formatDistance(plan.projected.PeR - (body?.radius ?? 0))}
                  </Value>

                  <Label>New Ecc</Label>
                  <Value>{plan.projected.eccentricity.toFixed(4)}</Value>

                  <Label>New T</Label>
                  <Value>{formatDuration(plan.projected.period)}</Value>

                  {plan.projected.inclination !== undefined && (
                    <>
                      <Label>New Inc</Label>
                      <Value>{plan.projected.inclination.toFixed(2)}°</Value>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Label>Projection</Label>
                  <Value>escape / invalid</Value>
                </>
              )}
            </PreviewGrid>

            {currentOrbit && ApR && PeR && (
              <DiagramWrap>
                <OrbitDiagram
                  variant="mini"
                  sma={sma ?? 0}
                  ecc={ecc ?? 0}
                  apoapsis={ApR}
                  periapsis={PeR}
                  trueAnomaly={trueAnomaly ?? 0}
                  argPe={argPe ?? 0}
                  bodyColor={body?.color}
                  bodyRadius={body?.radius}
                  projected={
                    plan.projected
                      ? {
                          sma: plan.projected.sma,
                          ecc: plan.projected.eccentricity,
                          apoapsis: plan.projected.ApR,
                          periapsis: plan.projected.PeR,
                        }
                      : null
                  }
                  maneuverHandles={
                    burnTrueAnomaly !== null &&
                    (preset === "custom-apo" ||
                      preset === "custom-peri" ||
                      preset === "custom-ut")
                      ? {
                          burnTrueAnomaly,
                          prograde,
                          radial,
                          onPrograde: setPrograde,
                          onRadial: setRadial,
                        }
                      : null
                  }
                />
              </DiagramWrap>
            )}

            {normal !== 0 && (
              <Note>
                Normal component tilts the plane; projection shows in-plane
                shape only.
              </Note>
            )}

            {error && <ErrorLine>{error}</ErrorLine>}

            <CommitRow>
              <Button
                onClick={() => void handleCommit()}
                disabled={committing || principia || feasible === false}
              >
                {committing ? "Adding…" : "Add node"}
              </Button>
            </CommitRow>
          </PreviewSection>
        )
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function NodeRow({
  node,
  currentUT,
  availableDv,
  onDelete,
}: {
  node: ParsedManeuverNode;
  currentUT: number | undefined;
  availableDv: number;
  onDelete: () => void;
}) {
  const timeTo = currentUT !== undefined ? node.UT - currentUT : null;
  const feasible =
    availableDv === 0 ? null : availableDv >= node.deltaVMagnitude;
  return (
    <NodeLi>
      <NodeMain>
        <NodePrimary>
          {node.deltaVMagnitude.toFixed(0)} m/s
          {feasible === false && (
            <FeasibilityChip $ok={false}>SHORT</FeasibilityChip>
          )}
        </NodePrimary>
        <NodeMeta>
          burn in {timeTo === null ? "—" : formatDuration(timeTo)}
        </NodeMeta>
      </NodeMain>
      <DeleteButton type="button" onClick={onDelete} aria-label="Delete node">
        ✕
      </DeleteButton>
    </NodeLi>
  );
}

function PresetPicker({
  value,
  onChange,
}: {
  value: PresetId;
  onChange: (next: PresetId) => void;
}) {
  return (
    <PresetSelect
      value={value}
      onChange={(e) => onChange(e.target.value as PresetId)}
    >
      {PRESETS.map((p) => (
        <option key={p.id} value={p.id}>
          {p.label}
        </option>
      ))}
    </PresetSelect>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  suffix = "m/s",
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  suffix?: string;
}) {
  return (
    <InputRow>
      <InputLabel>{label}</InputLabel>
      <InputField
        type="number"
        value={value}
        step={1}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
      <InputSuffix>{suffix}</InputSuffix>
    </InputRow>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<ManeuverPlannerConfig>({
  id: "maneuver-planner",
  name: "Maneuver Planner",
  description:
    "Plan maneuver nodes: circularise / custom ΔV at next apsis, with live preview + feasibility check against vessel ΔV.",
  tags: ["telemetry", "planning"],
  defaultSize: { w: 10, h: 18 },
  component: ManeuverPlannerComponent,
  dataRequirements: [
    "o.sma",
    "o.eccentricity",
    "o.ApR",
    "o.PeR",
    "o.argumentOfPeriapsis",
    "o.inclination",
    "o.lan",
    "o.trueAnomaly",
    "o.timeToAp",
    "o.timeToPe",
    "o.orbitalSpeed",
    "o.radius",
    "o.referenceBody",
    "o.maneuverNodes",
    "t.universalTime",
    "a.physicsMode",
    "v.body",
    "dv.stages",
    "tar.name",
    "tar.o.inclination",
    "tar.o.lan",
  ],
  behaviors: [],
  defaultConfig: { defaultPreset: "circularize-apo" },
  actions: maneuverActions,
  pushable: true,
});

export { ManeuverPlannerComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
`;

const SectionTitle = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #666;
  margin-bottom: 2px;
`;

const PrincipiaBanner = styled.div`
  font-size: 11px;
  background: #3a1a1a;
  border: 1px solid #4a2a2a;
  color: #fbb;
  padding: 4px 8px;
  border-radius: 2px;
`;

const Empty = styled.div`
  color: #555;
  font-size: 11px;
  padding: 4px 0;
`;

const WaitingPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  background: #0f0f0f;
  border: 1px solid #1f1f1f;
  border-radius: 2px;
`;

const StatusList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const StatusRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
`;

const StatusDot = styled.span<{ $ok: boolean }>`
  width: 12px;
  text-align: center;
  color: ${({ $ok }) => ($ok ? "#5f5" : "#a66")};
  font-family: monospace;
  font-size: 11px;
`;

const StatusLabel = styled.span`
  font-family: monospace;
  font-size: 11px;
  color: #888;
`;

const NodeList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const NodeLi = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 2px;
`;

const NodeMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const NodePrimary = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ccc;
`;

const NodeMeta = styled.div`
  font-size: 10px;
  color: #666;
  letter-spacing: 0.04em;
`;

const DeleteButton = styled.button`
  background: transparent;
  border: 1px solid #3a2222;
  color: #a66;
  font-family: monospace;
  font-size: 11px;
  width: 22px;
  height: 22px;
  border-radius: 2px;
  cursor: pointer;
  &:hover {
    background: #2a1111;
    color: #f88;
  }
`;

const ClearAllRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
`;

const GhostLink = styled.button`
  background: transparent;
  border: none;
  color: #666;
  font-family: monospace;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
  &:hover {
    color: #aaa;
  }
`;

const PresetSelect = styled.select`
  width: 100%;
  background: #141414;
  border: 1px solid #2a2a2a;
  color: #ccc;
  font-family: monospace;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 2px;
`;

const PresetDesc = styled.div`
  font-size: 11px;
  color: #666;
  padding-top: 2px;
`;

const CustomInputs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
`;

const UTModeRow = styled.div`
  display: flex;
  gap: 4px;
`;

const UTModeButton = styled.button<{ $active: boolean }>`
  background: ${({ $active }) => ($active ? "#2e5a2e" : "#1a1a1a")};
  border: 1px solid ${({ $active }) => ($active ? "#3e7a3e" : "#2a2a2a")};
  color: ${({ $active }) => ($active ? "#cfe" : "#888")};
  font-family: monospace;
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 2px;
  cursor: pointer;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const InputRow = styled.label`
  display: grid;
  grid-template-columns: 5em 1fr 2.5em;
  align-items: center;
  gap: 8px;
`;

const InputLabel = styled.span`
  font-size: 11px;
  color: #888;
  letter-spacing: 0.06em;
  text-transform: uppercase;
`;

const InputField = styled.input`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  color: #ccc;
  font-family: monospace;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 2px;
  text-align: right;
`;

const InputSuffix = styled.span`
  font-size: 10px;
  color: #555;
`;

const PreviewSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
`;

const PreviewGrid = styled.div`
  display: grid;
  grid-template-columns: 4em 1fr;
  gap: 2px 8px;
  align-items: baseline;
`;

const Label = styled.span`
  font-size: 10px;
  color: #555;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const accentColor = {
  ap: "#ff8c00",
  pe: "#4499ff",
};

const Value = styled.span<{ $accent?: "ap" | "pe" }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ $accent }) => ($accent ? accentColor[$accent] : "#ccc")};
  letter-spacing: 0.03em;
`;

const FeasibilityChip = styled.span<{ $ok: boolean }>`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: ${({ $ok }) => ($ok ? "#1f3a1f" : "#3a1a1a")};
  border: 1px solid ${({ $ok }) => ($ok ? "#2e5a2e" : "#5a2a2a")};
  color: ${({ $ok }) => ($ok ? "#cfe" : "#fbb")};
  letter-spacing: 0.08em;
`;

const DiagramWrap = styled.div`
  height: 180px;
  flex-shrink: 0;
  display: flex;
`;

const Note = styled.div`
  font-size: 10px;
  color: #666;
  font-style: italic;
`;

const ErrorLine = styled.div`
  font-size: 11px;
  color: #fbb;
  background: #2a1111;
  border: 1px solid #4a2a2a;
  padding: 4px 6px;
  border-radius: 2px;
`;

const CommitRow = styled.div`
  display: flex;
  justify-content: flex-end;
  padding-top: 4px;
`;
