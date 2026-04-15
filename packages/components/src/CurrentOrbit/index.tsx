import styled from 'styled-components';
import { registerComponent, useDataValue, getBody } from '@gonogo/core';
import {
  formatDistance,
  formatDuration,
  trueAnomalyToRadius,
  orbitalToCartesian,
} from '@gonogo/core';
import type { ComponentProps } from '@gonogo/core';

interface CurrentOrbitConfig {
  /** Show the mini SVG orbit diagram. Default: true. */
  showDiagram?: boolean;
}

function CurrentOrbitComponent({ config }: ComponentProps<CurrentOrbitConfig>) {
  const showDiagram = config?.showDiagram ?? true;

  const apoapsisA    = useDataValue('telemachus', 'o.ApA');
  const periapsisA   = useDataValue('telemachus', 'o.PeA');
  const apoapsisR    = useDataValue('telemachus', 'o.ApR');
  const periapsisR   = useDataValue('telemachus', 'o.PeR');
  const eccentricity = useDataValue('telemachus', 'o.eccentricity');
  const inclination  = useDataValue('telemachus', 'o.inclination');
  const period       = useDataValue('telemachus', 'o.period');
  const timeToAp     = useDataValue('telemachus', 'o.timeToAp');
  const timeToPe     = useDataValue('telemachus', 'o.timeToPe');
  const refBody      = useDataValue('telemachus', 'o.referenceBody');
  const bodyName     = useDataValue('telemachus', 'v.body');

  const body = (bodyName ?? refBody) !== undefined
    ? getBody(bodyName ?? refBody ?? '')
    : undefined;

  return (
    <Panel>
      <Title>ORBIT</Title>
      {refBody !== undefined && (
        <RefBody>{refBody}</RefBody>
      )}

      <Grid>
        <Label>Ap</Label>
        <Value $accent="ap">
          {apoapsisA !== undefined ? formatDistance(apoapsisA) : '—'}
        </Value>

        <Label>Pe</Label>
        <Value $accent="pe">
          {periapsisA !== undefined ? formatDistance(periapsisA) : '—'}
        </Value>

        <Label>Ecc</Label>
        <Value>{eccentricity !== undefined ? eccentricity.toFixed(4) : '—'}</Value>

        <Label>Inc</Label>
        <Value>{inclination !== undefined ? `${inclination.toFixed(1)}°` : '—'}</Value>

        <Label>T</Label>
        <Value>{period !== undefined ? formatDuration(period) : '—'}</Value>

        <Label>t-Ap</Label>
        <Value $accent="ap">
          {timeToAp !== undefined ? formatDuration(timeToAp) : '—'}
        </Value>

        <Label>t-Pe</Label>
        <Value $accent="pe">
          {timeToPe !== undefined ? formatDuration(timeToPe) : '—'}
        </Value>
      </Grid>

      {showDiagram && apoapsisR !== undefined && periapsisR !== undefined && (
        <MiniDiagram
          apoapsis={apoapsisR}
          periapsis={periapsisR}
          eccentricity={eccentricity ?? 0}
          trueAnomaly={0}
          bodyRadius={body?.radius}
          bodyColor={body?.color}
        />
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Mini SVG orbit diagram
// ---------------------------------------------------------------------------

interface MiniDiagramProps {
  apoapsis: number;
  periapsis: number;
  eccentricity: number;
  trueAnomaly: number;
  bodyRadius?: number;
  bodyColor?: string;
}

function MiniDiagram({
  apoapsis,
  periapsis,
  eccentricity: ecc,
  trueAnomaly,
  bodyRadius,
  bodyColor,
}: MiniDiagramProps) {
  // Orbital geometry from apoapsis/periapsis radii (distance from body centre)
  // sma (semi-major axis from focus): a = (rAp + rPe) / 2
  const rAp = apoapsis;
  const rPe = periapsis;
  const sma = (rAp + rPe) / 2;
  const b = sma * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const c = sma * ecc;
  const padding = rAp * 0.18;

  const vbX = -(rAp + padding);
  const vbY = -(b + padding);
  const vbW = rAp + rPe + 2 * padding;
  const vbH = 2 * (b + padding);

  const bodyDisc = bodyRadius
    ? Math.min(bodyRadius, rAp * 0.2)
    : rAp * 0.06;

  const strokeW = rAp * 0.012;
  const dotR = rAp * 0.025;

  // Vessel position using true anomaly
  const r = trueAnomalyToRadius(sma, ecc, trueAnomaly);
  const { x: vx, y: vy } = orbitalToCartesian(r, trueAnomaly);

  return (
    <DiagramSvg
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {/* Body at focus */}
      <circle cx={0} cy={0} r={bodyDisc} fill={bodyColor ?? '#444'} />

      {/* Orbit ellipse: centre at (-c, 0) from focus */}
      <ellipse
        cx={-c}
        cy={0}
        rx={sma}
        ry={b}
        fill="none"
        stroke="rgba(0,255,136,0.35)"
        strokeWidth={strokeW}
      />

      {/* Apoapsis marker */}
      <circle cx={-rAp} cy={0} r={dotR} fill="#ff8c00" />

      {/* Periapsis marker */}
      <circle cx={rPe} cy={0} r={dotR} fill="#4499ff" />

      {/* Vessel */}
      <circle cx={vx} cy={-vy} r={dotR * 1.3} fill="#00ff88" />
    </DiagramSvg>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<CurrentOrbitConfig>({
  id: 'current-orbit',
  name: 'Current Orbit',
  description: 'Displays orbital parameters: apoapsis, periapsis, eccentricity, inclination, period, and time to Ap/Pe.',
  tags: ['telemetry'],
  defaultSize: { w: 3, h: 6 },
  component: CurrentOrbitComponent,
  dataRequirements: [
    'o.ApA', 'o.PeA', 'o.ApR', 'o.PeR', 'o.eccentricity', 'o.inclination',
    'o.period', 'o.timeToAp', 'o.timeToPe', 'o.referenceBody', 'v.body',
  ],
  behaviors: [],
  defaultConfig: { showDiagram: true },
});

export { CurrentOrbitComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
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

const Grid = styled.div`
  display: grid;
  grid-template-columns: 3em 1fr;
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
  ap: '#ff8c00',
  pe: '#4499ff',
};

const Value = styled.span<{ $accent?: 'ap' | 'pe' }>`
  font-size: 13px;
  color: ${({ $accent }) => ($accent ? accentColor[$accent] : '#ccc')};
  letter-spacing: 0.03em;
`;

const DiagramSvg = styled.svg`
  width: 100%;
  height: 80px;
  display: block;
  margin-top: 4px;
`;
