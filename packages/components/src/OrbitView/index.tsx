import type { ComponentProps } from "@gonogo/core";
import {
  getBody,
  orbitalToCartesian,
  registerComponent,
  trueAnomalyToRadius,
  useDataValue,
} from "@gonogo/core";
import { useIsOrbiting } from "./useIsOrbiting";
import { Panel, PanelTitle } from "@gonogo/ui";
import styled from "styled-components";

interface OrbitViewConfig {
  /** Show Ap/Pe markers. Default: true. */
  showMarkers?: boolean;
}

function OrbitViewComponent({
  config,
}: Readonly<ComponentProps<OrbitViewConfig>>) {
  const showMarkers = config?.showMarkers ?? true;

  const sma = useDataValue("telemachus", "o.sma");
  const eccentricity = useDataValue("telemachus", "o.eccentricity");
  const trueAnomaly = useDataValue("telemachus", "o.trueAnomaly");
  const apoapsisR = useDataValue("telemachus", "o.ApR");
  const periapsisR = useDataValue("telemachus", "o.PeR");
  const argPe = useDataValue("telemachus", "o.argumentOfPeriapsis");
  const bodyName = useDataValue("telemachus", "v.body");

  const body = bodyName === undefined ? undefined : getBody(bodyName);
  const { isOrbiting } = useIsOrbiting();

  const hasOrbit =
    sma !== undefined &&
    eccentricity !== undefined &&
    apoapsisR !== undefined &&
    periapsisR !== undefined;

  return (
    <Panel>
      <Title>ORBIT VIEW</Title>
      {bodyName !== undefined && <RefBody>{bodyName}</RefBody>}

      {hasOrbit ? (
        <OrbitDiagram
          sma={sma}
          ecc={eccentricity}
          apoapsis={apoapsisR}
          periapsis={periapsisR}
          trueAnomaly={trueAnomaly ?? 0}
          argPe={argPe ?? 0}
          showMarkers={showMarkers}
          bodyColor={body?.color}
          bodyRadius={body?.radius}
          isOrbiting={isOrbiting}
        />
      ) : (
        <NoData>No orbital data</NoData>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// SVG diagram
// ---------------------------------------------------------------------------

interface OrbitDiagramProps {
  sma: number;
  ecc: number;
  apoapsis: number;
  periapsis: number;
  trueAnomaly: number;
  argPe: number;
  showMarkers: boolean;
  bodyColor?: string;
  bodyRadius?: number;
  isOrbiting: boolean;
}

function OrbitDiagram({
  sma,
  ecc,
  apoapsis,
  periapsis,
  trueAnomaly,
  argPe,
  showMarkers,
  bodyColor,
  bodyRadius,
  isOrbiting,
}: Readonly<OrbitDiagramProps>) {
  // Orbital geometry (all distances in the same units as sma/apoapsis/periapsis)
  const b = sma * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const c = sma * ecc;

  // ViewBox: centred on the focus (body), with 15% padding around the apoapsis radius
  const rMax = apoapsis;
  const padding = rMax * 0.15;

  const vbHalf = rMax + padding;
  const vbSize = 2 * vbHalf;

  // Body disc uses the real radius so low-orbit diagrams show the body at true scale
  const bodyDisc = bodyRadius ?? rMax * 0.04;
  const strokeW = rMax * 0.014;
  const dotR = rMax * 0.028;

  const orbitStroke = isOrbiting
    ? "rgba(0,255,136,0.55)"
    : "rgba(255,80,0,0.55)";

  // Vessel position
  const r = trueAnomalyToRadius(sma, ecc, trueAnomaly);
  const { x: vx, y: vy } = orbitalToCartesian(r, trueAnomaly);

  return (
    <DiagramSvg
      viewBox={`${-vbHalf} ${-vbHalf} ${vbSize} ${vbSize}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Orbital diagram"
    >
      {/* Trajectory ellipse first so it renders under the body disc */}
      <g transform={`rotate(${-argPe})`}>
        <ellipse
          cx={-c}
          cy={0}
          rx={sma}
          ry={b}
          fill="none"
          stroke={orbitStroke}
          strokeWidth={strokeW}
        />
      </g>

      {/* Body at focus (origin) — drawn over the trajectory line */}
      <circle cx={0} cy={0} r={bodyDisc} fill={bodyColor ?? "#4a90d9"} />

      {/* Markers and vessel dot — drawn over the body */}
      <g transform={`rotate(${-argPe})`}>
        {showMarkers && (
          <>
            {/* Apoapsis marker (θ=180° → -x side) */}
            <circle cx={-apoapsis} cy={0} r={dotR} fill="#ff8c00" />
            <text
              x={-apoapsis}
              y={-dotR * 2.5}
              textAnchor="middle"
              fill="#ff8c00"
              fontSize={rMax * 0.04}
            >
              Ap
            </text>

            {/* Periapsis marker (θ=0° → +x side) */}
            <circle cx={periapsis} cy={0} r={dotR} fill="#4499ff" />
            <text
              x={periapsis}
              y={-dotR * 2.5}
              textAnchor="middle"
              fill="#4499ff"
              fontSize={rMax * 0.04}
            >
              Pe
            </text>
          </>
        )}

        {/* Vessel dot — y-flipped for SVG coordinate system */}
        <circle cx={vx} cy={-vy} r={dotR * 1.5} fill="#00ff88" />
      </g>
    </DiagramSvg>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<OrbitViewConfig>({
  id: "orbit-view",
  name: "Orbit View",
  description:
    "SVG diagram of the current orbit ellipse with vessel position, apoapsis, and periapsis markers.",
  tags: ["telemetry"],
  defaultSize: { w: 9, h: 18 },
  component: OrbitViewComponent,
  dataRequirements: [
    "o.sma",
    "o.eccentricity",
    "o.trueAnomaly",
    "o.ApR",
    "o.PeR",
    "o.ApA",
    "o.PeA",
    "o.argumentOfPeriapsis",
    "v.body",
  ],
  behaviors: [],
  defaultConfig: { showMarkers: true },
});

export { OrbitViewComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Title = styled(PanelTitle)`
  font-size: 10px;
  letter-spacing: 0.15em;
`;

const RefBody = styled.div`
  font-size: 12px;
  color: #888;
  letter-spacing: 0.05em;
  margin-top: -4px;
`;

const DiagramSvg = styled.svg`
  width: 100%;
  flex: 1;
  min-height: 0;
  display: block;
`;

const NoData = styled.div`
  font-size: 11px;
  color: #444;
  padding: 8px 0;
`;
