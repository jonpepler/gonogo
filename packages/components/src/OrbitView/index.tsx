import styled from 'styled-components';
import { registerComponent, useDataValue, getBody } from '@gonogo/core';
import { trueAnomalyToRadius, orbitalToCartesian } from '@gonogo/core';
import type { ComponentProps } from '@gonogo/core';

interface OrbitViewConfig {
  /** Show Ap/Pe markers. Default: true. */
  showMarkers?: boolean;
}

function OrbitViewComponent({ config }: ComponentProps<OrbitViewConfig>) {
  const showMarkers = config?.showMarkers ?? true;

  const sma         = useDataValue<number>('telemachus', 'o.sma');
  const eccentricity = useDataValue<number>('telemachus', 'o.eccentricity');
  const trueAnomaly  = useDataValue<number>('telemachus', 'o.trueAnomaly');
  const apoapsis     = useDataValue<number>('telemachus', 'o.apoapsis');
  const periapsis    = useDataValue<number>('telemachus', 'o.periapsis');
  const argPe        = useDataValue<number>('telemachus', 'o.argumentOfPeriapsis');
  const bodyName     = useDataValue<string>('telemachus', 'v.body');

  const body = bodyName !== undefined ? getBody(bodyName) : undefined;

  const hasOrbit =
    sma !== undefined &&
    eccentricity !== undefined &&
    apoapsis !== undefined &&
    periapsis !== undefined;

  return (
    <Panel>
      <Title>ORBIT VIEW</Title>
      {bodyName !== undefined && <RefBody>{bodyName}</RefBody>}

      {hasOrbit ? (
        <OrbitDiagram
          sma={sma!}
          ecc={eccentricity!}
          apoapsis={apoapsis!}
          periapsis={periapsis!}
          trueAnomaly={trueAnomaly ?? 0}
          argPe={argPe ?? 0}
          showMarkers={showMarkers}
          bodyColor={body?.color}
          bodyRadius={body?.radius}
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
}: OrbitDiagramProps) {
  // Orbital geometry (all distances in the same units as sma/apoapsis/periapsis)
  const b = sma * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const c = sma * ecc;

  // ViewBox: centred on the focus (body), with 15% padding around the apoapsis radius
  const rMax = apoapsis;
  const padding = rMax * 0.15;

  const vbHalf = rMax + padding;
  const vbSize = 2 * vbHalf;

  // Scale sizes relative to rMax for resolution-independence
  const bodyDisc = bodyRadius
    ? Math.min(bodyRadius, rMax * 0.18)
    : rMax * 0.04;
  const strokeW = rMax * 0.008;
  const dotR = rMax * 0.02;

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
      {/* Body at focus (origin) */}
      <circle cx={0} cy={0} r={bodyDisc} fill={bodyColor ?? '#4a90d9'} />

      {/* Orbit group, rotated by argument of periapsis */}
      <g transform={`rotate(${-argPe})`}>
        {/* Orbit ellipse: centre at (-c, 0) from focus */}
        <ellipse
          cx={-c}
          cy={0}
          rx={sma}
          ry={b}
          fill="none"
          stroke="rgba(0,255,136,0.4)"
          strokeWidth={strokeW}
        />

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
        <circle cx={vx} cy={-vy} r={dotR * 1.4} fill="#00ff88" />
      </g>
    </DiagramSvg>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<OrbitViewConfig>({
  id: 'orbit-view',
  name: 'Orbit View',
  category: 'telemetry',
  component: OrbitViewComponent,
  dataRequirements: [
    'o.sma', 'o.eccentricity', 'o.trueAnomaly',
    'o.apoapsis', 'o.periapsis', 'o.argumentOfPeriapsis', 'v.body',
  ],
  behaviors: [],
  defaultConfig: { showMarkers: true },
});

export { OrbitViewComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #555;
  text-transform: uppercase;
`;

const RefBody = styled.div`
  font-size: 12px;
  color: #888;
  letter-spacing: 0.05em;
  margin-top: -4px;
`;

const DiagramSvg = styled.svg`
  width: 100%;
  height: 200px;
  display: block;
`;

const NoData = styled.div`
  font-size: 11px;
  color: #444;
  padding: 8px 0;
`;
