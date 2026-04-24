import type { ComponentProps } from "@gonogo/core";
import { registerComponent, useDataValue } from "@gonogo/core";
import { Panel, PanelSubtitle, PanelTitle } from "@gonogo/ui";
import styled from "styled-components";

// ── Config ────────────────────────────────────────────────────────────────────

// Empty config for now — kept so future toggles (resource visibility, stage
// stack hide/show, etc.) can slot in without changing the registration.
type FuelStatusConfig = Record<string, never>;

// ── Resource catalogue ────────────────────────────────────────────────────────

/**
 * Resources we know how to render, with a fixed colour and which scope to
 * read (`"current"` = current-stage only; `"vessel"` = vessel-wide totals).
 * Resources absent from the active vessel (max === 0) are skipped at render.
 */
interface ResourceDef {
  name:
    | "LiquidFuel"
    | "Oxidizer"
    | "MonoPropellant"
    | "XenonGas"
    | "ElectricCharge";
  label: string;
  color: string;
  scope: "current" | "vessel";
}

const RESOURCES: readonly ResourceDef[] = [
  {
    name: "LiquidFuel",
    label: "Liquid Fuel",
    color: "#4caf50",
    scope: "current",
  },
  { name: "Oxidizer", label: "Oxidizer", color: "#2196f3", scope: "current" },
  { name: "MonoPropellant", label: "RCS", color: "#ffd54f", scope: "vessel" },
  { name: "XenonGas", label: "Xenon", color: "#ab47bc", scope: "vessel" },
  { name: "ElectricCharge", label: "Power", color: "#ff9800", scope: "vessel" },
] as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useResourceReading(def: ResourceDef): { value: number; max: number } {
  const vesselKey = `r.resource[${def.name}]` as const;
  const vesselMaxKey = `r.resourceMax[${def.name}]` as const;
  const stageKey = `r.resourceCurrent[${def.name}]` as const;
  const stageMaxKey = `r.resourceCurrentMax[${def.name}]` as const;

  // Always subscribe to all four — calling useDataValue conditionally would
  // violate the Rules of Hooks. Cheap on Telemachus.
  const vessel = useDataValue("data", vesselKey) ?? 0;
  const vesselMax = useDataValue("data", vesselMaxKey) ?? 0;
  const stage = useDataValue("data", stageKey) ?? 0;
  const stageMax = useDataValue("data", stageMaxKey) ?? 0;

  return def.scope === "vessel"
    ? { value: vessel, max: vesselMax }
    : { value: stage, max: stageMax };
}

// ── Component ─────────────────────────────────────────────────────────────────

function FuelStatusComponent(_: Readonly<ComponentProps<FuelStatusConfig>>) {
  const currentStage = useDataValue("data", "v.currentStage");
  const stageCount = useDataValue("data", "dv.stageCount");

  // Hooks unrolled explicitly — Rules of Hooks forbids hook calls inside any
  // loop or `.map` callback (even ones that happen to iterate a constant
  // tuple). The RESOURCES catalogue has a fixed order so these reads are 1:1.
  const lf = useResourceReading(RESOURCES[0]);
  const ox = useResourceReading(RESOURCES[1]);
  const rcs = useResourceReading(RESOURCES[2]);
  const xe = useResourceReading(RESOURCES[3]);
  const ec = useResourceReading(RESOURCES[4]);
  const readings = [
    { def: RESOURCES[0], ...lf },
    { def: RESOURCES[1], ...ox },
    { def: RESOURCES[2], ...rcs },
    { def: RESOURCES[3], ...xe },
    { def: RESOURCES[4], ...ec },
  ];

  // `dv.stages` is the whole-vessel stage array. One subscription, all the
  // per-stage data Telemachus knows about — length matches the real stage
  // count, no hardcoded cap, no hook-per-stage. Entries arrive high → low
  // (stage 3 first, stage 0 last) matching the stack-top-down render order.
  const stages = useDataValue("data", "dv.stages") ?? [];
  const maxStageMass = Math.max(...stages.map((s) => s.fuelMass), 0.001);

  return (
    <Panel>
      <PanelTitle>FUEL</PanelTitle>
      {currentStage !== undefined && (
        <PanelSubtitle>
          Stage {currentStage}
          {stageCount !== undefined && ` / ${Math.max(stageCount - 1, 0)}`}
        </PanelSubtitle>
      )}

      <ResourceList>
        {readings
          .filter(({ max }) => max > 0)
          .map(({ def, value, max }) => (
            <ResourceRow key={def.name}>
              <ResourceLabel>
                {def.label}
                {def.scope === "current" && <ScopeHint> · stage</ScopeHint>}
                {def.scope === "vessel" && <ScopeHint> · vessel</ScopeHint>}
              </ResourceLabel>
              <Bar>
                <BarFill
                  style={{
                    width: `${clampPct((value / max) * 100)}%`,
                    background: def.color,
                  }}
                />
              </Bar>
              <ResourceReadout>
                {formatAmount(value)} / {formatAmount(max)}
              </ResourceReadout>
            </ResourceRow>
          ))}
      </ResourceList>

      {stages.length > 0 && (
        <StageStack>
          <StageHeader>Stages · fuel mass (kg)</StageHeader>
          {stages.map((s) => (
            <StageRow key={s.stage} $active={s.stage === currentStage}>
              <StageLabel>
                {s.stage === currentStage ? "▶ " : "  "}Stage {s.stage}
              </StageLabel>
              <Bar>
                <BarFill
                  style={{
                    width: `${clampPct((s.fuelMass / maxStageMass) * 100)}%`,
                    background: s.stage === currentStage ? "#ffb74d" : "#555",
                  }}
                />
              </Bar>
              <StageReadout>{formatKg(s.fuelMass)}</StageReadout>
            </StageRow>
          ))}
        </StageStack>
      )}
    </Panel>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clampPct(pct: number): number {
  if (!Number.isFinite(pct) || pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

/** Units of stock KSP resources aren't kg — Telemachus returns the raw unit count. */
function formatAmount(value: number): string {
  if (value >= 10_000) return value.toFixed(0);
  if (value >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

/** `dv.stageFuelMass[n]` is in kg. Display as kg under 1t, t above. */
function formatKg(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(2)} t`;
  return `${kg.toFixed(0)} kg`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ResourceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 6px;
`;

const ResourceRow = styled.div`
  display: grid;
  grid-template-columns: 7em 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 11px;
`;

const ResourceLabel = styled.span`
  color: #ccc;
  letter-spacing: 0.02em;
`;

const ScopeHint = styled.span`
  color: #555;
  font-size: 9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const ResourceReadout = styled.span`
  color: #888;
  font-family: monospace;
  font-size: 10px;
  white-space: nowrap;
`;

const Bar = styled.div`
  height: 8px;
  background: #111;
  border: 1px solid #222;
  overflow: hidden;
`;

const BarFill = styled.div`
  height: 100%;
  transition: width 120ms linear;
`;

const StageStack = styled.div`
  margin-top: 10px;
  padding-top: 6px;
  border-top: 1px solid #222;
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const StageHeader = styled.div`
  color: #555;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 4px;
`;

const StageRow = styled.div<{ $active?: boolean }>`
  display: grid;
  grid-template-columns: 5em 1fr auto;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: ${({ $active }) => ($active ? "#ffcc80" : "#888")};
`;

const StageLabel = styled.span`
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.02em;
`;

const StageReadout = styled.span`
  font-family: monospace;
  font-size: 10px;
  white-space: nowrap;
`;

// ── Registration ──────────────────────────────────────────────────────────────

registerComponent<FuelStatusConfig>({
  id: "fuel-status",
  name: "Fuel Status",
  description:
    "Current-stage fuel, oxidiser, RCS monopropellant, xenon, and electric charge bars, plus a per-stage fuel-mass stack.",
  tags: ["telemetry", "fuel"],
  defaultSize: { w: 8, h: 14 },
  component: FuelStatusComponent,
  dataRequirements: [
    "v.currentStage",
    "dv.stageCount",
    "r.resource[LiquidFuel]",
    "r.resourceMax[LiquidFuel]",
    "r.resourceCurrent[LiquidFuel]",
    "r.resourceCurrentMax[LiquidFuel]",
    "r.resource[Oxidizer]",
    "r.resourceMax[Oxidizer]",
    "r.resourceCurrent[Oxidizer]",
    "r.resourceCurrentMax[Oxidizer]",
    "r.resource[MonoPropellant]",
    "r.resourceMax[MonoPropellant]",
    "r.resourceCurrent[MonoPropellant]",
    "r.resourceCurrentMax[MonoPropellant]",
    "r.resource[XenonGas]",
    "r.resourceMax[XenonGas]",
    "r.resourceCurrent[XenonGas]",
    "r.resourceCurrentMax[XenonGas]",
    "r.resource[ElectricCharge]",
    "r.resourceMax[ElectricCharge]",
    "r.resourceCurrent[ElectricCharge]",
    "r.resourceCurrentMax[ElectricCharge]",
    "dv.stages",
  ],
  defaultConfig: {},
  actions: [],
  pushable: true,
});

export { FuelStatusComponent };
