import { orbitalToCartesian, trueAnomalyToRadius } from "@gonogo/core";
import styled from "styled-components";

export type OrbitDiagramVariant = "full" | "mini";

export interface OrbitDiagramProps {
  /** Semi-major axis (distance units matching apoapsis/periapsis). */
  sma: number;
  /** Orbital eccentricity [0, 1). */
  ecc: number;
  /** Apoapsis radius from body centre. */
  apoapsis: number;
  /** Periapsis radius from body centre. */
  periapsis: number;
  /** Current vessel true anomaly in degrees. */
  trueAnomaly: number;
  /** Argument of periapsis in degrees (rotates the ellipse in-plane). */
  argPe: number;
  /** Whether the vessel is in a stable orbit — drives trajectory colour. Defaults to true. */
  isOrbiting?: boolean;
  /** Body physical radius in same units as apoapsis/periapsis. */
  bodyRadius?: number;
  /** Body disc fill colour. Falls back to a neutral blue. */
  bodyColor?: string;
  /** "full" = square viewbox, Ap/Pe labels. "mini" = tight viewbox, no labels. */
  variant?: OrbitDiagramVariant;
  /** Show Ap/Pe dots (labels only rendered in "full" variant). Default: true. */
  showMarkers?: boolean;
}

// Per-variant styling knobs. Kept here so the two call sites don't diverge.
const variantConfig = {
  full: {
    padding: 0.15,
    strokeW: 0.014,
    dotR: 0.028,
    vesselDotScale: 1.5,
    showLabels: true,
    defaultBodyColor: "#4a90d9",
    defaultBodyDiscRatio: 0.04,
  },
  mini: {
    padding: 0.18,
    strokeW: 0.012,
    dotR: 0.025,
    vesselDotScale: 1.3,
    showLabels: false,
    defaultBodyColor: "#444",
    defaultBodyDiscRatio: 0.06,
  },
} as const;

export function OrbitDiagram({
  sma,
  ecc,
  apoapsis,
  periapsis,
  trueAnomaly,
  argPe,
  isOrbiting = true,
  bodyRadius,
  bodyColor,
  variant = "full",
  showMarkers = true,
}: Readonly<OrbitDiagramProps>) {
  const cfg = variantConfig[variant];

  // Orbital geometry — semi-minor axis and focus offset
  const b = sma * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const c = sma * ecc;

  // Scale reference: mini fits the full ellipse, full leaves square padding around apoapsis
  const scaleRef = apoapsis;
  const padding = scaleRef * cfg.padding;
  const strokeW = scaleRef * cfg.strokeW;
  const dotR = scaleRef * cfg.dotR;

  // Viewbox: full = square centred on focus; mini = tight rectangle hugging the ellipse
  const vb =
    variant === "full"
      ? (() => {
          const half = apoapsis + padding;
          return { x: -half, y: -half, w: 2 * half, h: 2 * half };
        })()
      : {
          x: -(apoapsis + padding),
          y: -(b + padding),
          w: apoapsis + periapsis + 2 * padding,
          h: 2 * (b + padding),
        };

  // Body disc uses real radius when known, capped for mini so the body doesn't dominate
  const bodyDisc = bodyRadius
    ? variant === "mini"
      ? Math.min(bodyRadius, apoapsis * 0.2)
      : bodyRadius
    : scaleRef * cfg.defaultBodyDiscRatio;

  const orbitStroke = isOrbiting
    ? "rgba(0,255,136,0.55)"
    : "rgba(255,80,0,0.55)";

  // Vessel position from true anomaly (body-centric polar → cartesian)
  const r = trueAnomalyToRadius(sma, ecc, trueAnomaly);
  const { x: vx, y: vy } = orbitalToCartesian(r, trueAnomaly);

  return (
    <DiagramSvg
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Orbital diagram"
    >
      {/* Trajectory first so the body overdraws it at the focus */}
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

      <circle
        cx={0}
        cy={0}
        r={bodyDisc}
        fill={bodyColor ?? cfg.defaultBodyColor}
      />

      <g transform={`rotate(${-argPe})`}>
        {showMarkers && (
          <>
            <circle cx={-apoapsis} cy={0} r={dotR} fill="#ff8c00" />
            <circle cx={periapsis} cy={0} r={dotR} fill="#4499ff" />
            {cfg.showLabels && (
              <>
                <text
                  x={-apoapsis}
                  y={-dotR * 2.5}
                  textAnchor="middle"
                  fill="#ff8c00"
                  fontSize={scaleRef * 0.04}
                >
                  Ap
                </text>
                <text
                  x={periapsis}
                  y={-dotR * 2.5}
                  textAnchor="middle"
                  fill="#4499ff"
                  fontSize={scaleRef * 0.04}
                >
                  Pe
                </text>
              </>
            )}
          </>
        )}

        {/* Vessel — SVG y-flipped relative to orbital frame */}
        <circle cx={vx} cy={-vy} r={dotR * cfg.vesselDotScale} fill="#00ff88" />
      </g>
    </DiagramSvg>
  );
}

const DiagramSvg = styled.svg`
  width: 100%;
  height: 100%;
  display: block;
  flex: 1;
  min-height: 0;
`;
