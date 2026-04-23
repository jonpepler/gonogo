import { orbitalToCartesian, trueAnomalyToRadius } from "@gonogo/core";
import styled from "styled-components";

export type OrbitDiagramVariant = "full" | "mini";

/**
 * A second orbit drawn on the same frame as the main one, dashed and in a
 * contrasting colour. Used for maneuver-planner previews ("what will the
 * orbit become after this burn?") without forcing callers to mount two
 * diagrams side by side.
 */
export interface ProjectedOrbit {
  sma: number;
  ecc: number;
  apoapsis: number;
  periapsis: number;
  /**
   * Optional — argument of periapsis of the projected orbit. Defaults to
   * the main orbit's argPe, which is correct for burns at an apsis (the
   * line of apsides is preserved).
   */
  argPe?: number;
}

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
  /**
   * Optional projected orbit drawn dashed behind the current one. Pass
   * `null` (or omit) to skip. The viewBox grows to contain the larger of
   * the two apoapses so the overlay never clips.
   */
  projected?: ProjectedOrbit | null;
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
  projected = null,
}: Readonly<OrbitDiagramProps>) {
  const cfg = variantConfig[variant];

  // Orbital geometry — semi-minor axis and focus offset
  const b = sma * Math.sqrt(Math.max(0, 1 - ecc * ecc));
  const c = sma * ecc;

  // Projected orbit geometry (optional overlay)
  const projB = projected
    ? projected.sma *
      Math.sqrt(Math.max(0, 1 - projected.ecc * projected.ecc))
    : 0;
  const projC = projected ? projected.sma * projected.ecc : 0;
  const projArgPe = projected?.argPe ?? argPe;

  // Scale reference: expand to contain whichever orbit reaches furthest.
  const scaleRef = Math.max(apoapsis, projected?.apoapsis ?? 0);
  const padding = scaleRef * cfg.padding;
  const strokeW = scaleRef * cfg.strokeW;
  const dotR = scaleRef * cfg.dotR;

  // Viewbox sizing considers both orbits so the projected overlay never clips.
  const vbApo = Math.max(apoapsis, projected?.apoapsis ?? 0);
  const vbPeri = Math.max(periapsis, projected?.periapsis ?? 0);
  const vbB = Math.max(b, projB);
  const vb =
    variant === "full"
      ? (() => {
          const half = vbApo + padding;
          return { x: -half, y: -half, w: 2 * half, h: 2 * half };
        })()
      : {
          x: -(vbApo + padding),
          y: -(vbB + padding),
          w: vbApo + vbPeri + 2 * padding,
          h: 2 * (vbB + padding),
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
      {/* Projected orbit (behind) — dashed, amber to contrast with the
          green "current" trajectory. Drawn before the current orbit so
          the live trajectory stays visually dominant. */}
      {projected && (
        <g transform={`rotate(${-projArgPe})`}>
          <ellipse
            cx={-projC}
            cy={0}
            rx={projected.sma}
            ry={projB}
            fill="none"
            stroke="rgba(255,180,40,0.75)"
            strokeWidth={strokeW}
            strokeDasharray={`${strokeW * 4} ${strokeW * 3}`}
          />
        </g>
      )}

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
