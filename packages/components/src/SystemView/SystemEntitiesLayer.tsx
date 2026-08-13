import type { CSSProperties, KeyboardEvent } from "react";
import { useMemo } from "react";
// InteractiveMarker below is a styled.g whose keyboard focus ring
// (`&:focus-visible .focus-ring`) is an SVG pseudo-class + descendant rule
// that inline `style` cannot express, and no ui-kit primitive is an SVG <g>
// focus wrapper. Same pattern as `ShipMap/ShipDiagramSvg.tsx`'s `PartGroup`.
// Shared by both interactive shapes (point markers and, since Task 5,
// vessel orbit-path rings): the focus treatment is identical either way.
// biome-ignore lint/style/noRestrictedImports: SVG <g> focus ring, no inline/primitive equivalent (see above)
import { styled } from "styled-components";
import {
  formatEntityLabel,
  type ResolvedSystemEntity,
  resolveSystemEntities,
  type SystemEntitiesContext,
  type SystemEntity,
  type SystemEntityStyle,
} from "./systemEntities";

/**
 * Draws every `system-view.entities` contribution as an SVG primitive, in
 * its own absolutely-positioned layer matching the diagram's auto-fit
 * viewBox (same static, non-zoom-tracking projection contract as the
 * `system-view.overlay` augment slot: `ctx` is typically SystemView's own
 * `overlayContext`, reused rather than recomputed). Renders nothing (`null`)
 * when nothing projects, so an empty contribution set costs nothing.
 */

/** A moving traffic highlight riding an ALREADY-drawn `connection-line`
 *  entity: never a second render of the graph geometry, purely a decoration
 *  keyed by that entity's own id (see `commsTraffic.ts`'s module doc
 *  comment). Rendered as a travelling gradient glow along the line rather
 *  than a discrete marker, deliberately: an earlier version drew this as a
 *  circle riding the line, which read as a second vessel dot sitting on its
 *  own orbit. A sweeping highlight can't be confused with a point marker. */
export interface SystemEntityPulse {
  /** Stable identity for this pulse (its `system.uplink.pending` entry's own
   *  id): the React key, since two pulses can share an `edgeId` at once. */
  id: string;
  /** The `connection-line` entity id this pulse currently sits on. */
  edgeId: string;
  /** 0..1 along the edge's own a -> b direction (its x1,y1 -> x2,y2 draw order). */
  t: number;
  opacity: number;
}

export interface SystemEntitiesLayerProps {
  entities: readonly SystemEntity[];
  ctx: SystemEntitiesContext;
  /** Id-keyed decoration hook: see `resolveSystemEntities`'s own doc comment. */
  decorate?: (id: string) => SystemEntityStyle | undefined;
  /** Currently selected entity id, if any: drives `aria-pressed` on the matching marker. */
  selectedId?: string | null;
  /**
   * Fires when a vessel display object is activated (click, Enter, Space):
   * a `point` marker, or an `orbit-path` ring that carries a `vesselId`
   * (Task 5, selection). Connection lines and blobs stay background
   * geometry, never selectable targets, and an `orbit-path` with no
   * `vesselId` (a hypothetical non-vessel ring) stays inert too. Omitted:
   * every shape renders as a plain (non-interactive, non-focusable) marker.
   */
  onEntityActivate?: (id: string) => void;
  /**
   * Command-traffic gradient sweeps (Task 6): one travelling glow per
   * in-flight `system.uplink.pending` entry, riding an already-resolved
   * `connection-line`'s endpoints via an SVG `linearGradient` whose bright
   * band is centred on the pulse's own `t`. A pulse whose `edgeId` doesn't
   * match any resolved connection-line (off-frame, or the contribution
   * hasn't drawn it) is silently skipped, the same "just doesn't render this
   * frame" contract every other entity follows. Omitted or empty: renders
   * nothing extra.
   */
  pulses?: readonly SystemEntityPulse[];
}

export function SystemEntitiesLayer({
  entities,
  ctx,
  decorate,
  selectedId,
  onEntityActivate,
  pulses,
}: Readonly<SystemEntitiesLayerProps>) {
  const resolved = useMemo(
    () => resolveSystemEntities(entities, ctx, decorate),
    [entities, ctx, decorate],
  );

  const resolvedPulses = useMemo(() => {
    if (!pulses || pulses.length === 0) return [];
    const edgesById = new Map(
      resolved
        .filter((r) => r.kind === "connection-line")
        .map((r) => [r.id, r] as const),
    );
    return pulses.flatMap((p) => {
      const edge = edgesById.get(p.edgeId);
      if (!edge || edge.kind !== "connection-line") return [];
      const t = Math.min(Math.max(p.t, 0), 1);
      return [
        {
          id: p.id,
          edgeId: p.edgeId,
          opacity: p.opacity,
          x1: edge.x1,
          y1: edge.y1,
          x2: edge.x2,
          y2: edge.y2,
          t,
          bandStart: Math.max(0, t - PULSE_BAND_T),
          bandEnd: Math.min(1, t + PULSE_BAND_T),
        },
      ];
    });
  }, [pulses, resolved]);

  if (resolved.length === 0 && resolvedPulses.length === 0) return null;

  const halfW = ctx.width / 2;
  const halfH = ctx.height / 2;
  const viewBox = `${ctx.center.x - halfW} ${ctx.center.y - halfH} ${ctx.width} ${ctx.height}`;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      style={LAYER_SVG}
    >
      {resolved.map((r) => (
        <Primitive
          key={r.id}
          resolved={r}
          selected={selectedId === r.id}
          onActivate={onEntityActivate}
        />
      ))}
      {resolvedPulses.length > 0 && (
        <defs>
          {resolvedPulses.map((p) => (
            <linearGradient
              key={p.id}
              id={`system-entities-pulse-${p.id}`}
              gradientUnits="userSpaceOnUse"
              x1={p.x1}
              y1={p.y1}
              x2={p.x2}
              y2={p.y2}
            >
              <stop
                offset={p.bandStart}
                stopColor={PULSE_BASE_COLOUR}
                stopOpacity={0}
              />
              <stop
                offset={p.t}
                stopColor={PULSE_PEAK_COLOUR}
                stopOpacity={p.opacity}
              />
              <stop
                offset={p.bandEnd}
                stopColor={PULSE_BASE_COLOUR}
                stopOpacity={0}
              />
            </linearGradient>
          ))}
        </defs>
      )}
      {resolvedPulses.map((p) => (
        <line
          key={p.id}
          data-pulse-edge-id={p.edgeId}
          x1={p.x1}
          y1={p.y1}
          x2={p.x2}
          y2={p.y2}
          stroke={`url(#system-entities-pulse-${p.id})`}
          strokeWidth={PULSE_STROKE_WIDTH_PX}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ))}
    </svg>
  );
}

function Primitive({
  resolved: r,
  selected,
  onActivate,
}: Readonly<{
  resolved: ResolvedSystemEntity;
  selected: boolean;
  onActivate?: (id: string) => void;
}>) {
  switch (r.kind) {
    case "orbit-path": {
      // Only a vessel's own ring is selectable (`vesselId` set): a body's
      // orbit ring, drawn by `SystemDiagram` itself rather than this layer,
      // never reaches here, but a future non-vessel `orbit-path`
      // contribution shouldn't accidentally become clickable either.
      const interactive = onActivate !== undefined && r.vesselId != null;
      if (!interactive) {
        return (
          <g
            transform={`rotate(${r.rotationDeg})`}
            pointerEvents="none"
            data-entity-id={r.id}
          >
            <ellipse
              cx={r.cx}
              cy={r.cy}
              rx={r.rx}
              ry={r.ry}
              fill="none"
              stroke={r.colour}
              strokeOpacity={r.opacity}
              strokeWidth={1.2}
            />
          </g>
        );
      }
      const activate = () => onActivate?.(r.id);
      return (
        <InteractiveMarker
          transform={`rotate(${r.rotationDeg})`}
          data-entity-id={r.id}
          role="button"
          tabIndex={0}
          aria-label={formatEntityLabel(r.id, r.meta)}
          aria-pressed={selected}
          onClick={activate}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activate();
            }
          }}
          style={POINT_INTERACTIVE_STYLE}
        >
          {/* Transparent, wider stroke: enlarges the click/tap hit target
              past the thin visible ring without changing its drawn weight. */}
          <ellipse
            data-hit-target="true"
            cx={r.cx}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
          />
          <ellipse
            data-ring="true"
            cx={r.cx}
            cy={r.cy}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke={r.colour}
            strokeOpacity={r.opacity}
            strokeWidth={1.2}
          />
          <ellipse
            className="focus-ring"
            cx={r.cx}
            cy={r.cy}
            rx={r.rx + 3}
            ry={r.ry + 3}
            fill="none"
            stroke="var(--color-accent-fg)"
            strokeWidth={2}
            pointerEvents="none"
          />
        </InteractiveMarker>
      );
    }
    case "connection-line":
      return (
        <line
          x1={r.x1}
          y1={r.y1}
          x2={r.x2}
          y2={r.y2}
          stroke={r.colour}
          strokeOpacity={r.opacity}
          strokeWidth={1.4}
          pointerEvents="none"
          data-entity-id={r.id}
        />
      );
    case "blob":
      return (
        <circle
          cx={r.x}
          cy={r.y}
          r={r.radiusPx}
          fill={r.colour}
          fillOpacity={r.opacity * 0.3}
          stroke={r.colour}
          strokeOpacity={r.opacity}
          strokeWidth={1}
          pointerEvents="none"
          data-entity-id={r.id}
        />
      );
    case "plume":
      return (
        <path
          d={plumePath(r)}
          fill={r.colour}
          fillOpacity={r.opacity * 0.3}
          stroke={r.colour}
          strokeOpacity={r.opacity}
          strokeWidth={1}
          strokeLinejoin="round"
          pointerEvents="none"
          data-entity-id={r.id}
        />
      );
    case "point": {
      const interactive = onActivate !== undefined;
      const activate = () => onActivate?.(r.id);
      const interactiveProps = interactive
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": formatEntityLabel(r.id, r.meta),
            "aria-pressed": selected,
            onClick: activate,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activate();
              }
            },
            style: POINT_INTERACTIVE_STYLE,
          }
        : { style: POINT_STATIC_STYLE };
      return (
        <InteractiveMarker data-entity-id={r.id} {...interactiveProps}>
          <circle
            cx={r.x}
            cy={r.y}
            r={r.radiusPx}
            fill={r.colour}
            fillOpacity={r.opacity}
            stroke="var(--color-text-inverse)"
            strokeWidth={1}
          />
          {interactive && (
            <circle
              className="focus-ring"
              cx={r.x}
              cy={r.y}
              r={r.radiusPx + 3}
              fill="none"
              stroke="var(--color-accent-fg)"
              strokeWidth={2}
              pointerEvents="none"
            />
          )}
        </InteractiveMarker>
      );
    }
    default:
      return null;
  }
}

/**
 * A directional wedge, apex at `x1,y1` narrowing to a point, tip a rounded
 * cap of width `2*halfWidthPx` centred on `x2,y2`: a teardrop pointing away
 * from the apex, not a symmetric blob. The tip's outward bulge (the
 * quadratic curve's control point, offset past `x2,y2` along the same
 * apex->tip direction) is what reads as "leading edge" rather than a
 * flat-cut cone.
 */
function plumePath(r: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  halfWidthPx: number;
}): string {
  const dx = r.x2 - r.x1;
  const dy = r.y2 - r.y1;
  const length = Math.hypot(dx, dy);
  const [ux, uy] = length > 0 ? [dx / length, dy / length] : [1, 0];
  const [px, py] = [-uy, ux];
  const tipAx = r.x2 + px * r.halfWidthPx;
  const tipAy = r.y2 + py * r.halfWidthPx;
  const tipBx = r.x2 - px * r.halfWidthPx;
  const tipBy = r.y2 - py * r.halfWidthPx;
  const bulge = r.halfWidthPx * 0.6;
  const ctrlX = r.x2 + ux * bulge;
  const ctrlY = r.y2 + uy * bulge;
  return `M ${r.x1} ${r.y1} L ${tipAx} ${tipAy} Q ${ctrlX} ${ctrlY} ${tipBx} ${tipBy} Z`;
}

/** Half-width, in `t` units along the edge, of the pulse's bright band: a
 *  travelling gradient highlight rather than a discrete marker, so command
 *  traffic can't be mistaken for a vessel point riding the line. */
const PULSE_BAND_T = 0.14;
/** Gradient band ends: same faint grey the CommNet lines themselves already
 *  draw in (`EMPHASIS_COLOUR.faint`, `systemEntities.ts`), so the sweep
 *  reads as a highlight moving along the line rather than a new colour. */
const PULSE_BASE_COLOUR = "var(--color-text-faint)";
/** Gradient band peak: the same accent token every other "this is live and
 *  active" decoration in this layer already uses (focus rings, `bright`
 *  emphasis). */
const PULSE_PEAK_COLOUR = "var(--color-accent-fg)";
const PULSE_STROKE_WIDTH_PX = 3;

const LAYER_SVG: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "block",
  // Empty space between markers stays click-through to the diagram beneath
  // (pan/zoom, body hover); each interactive point re-enables pointer events
  // on itself.
  pointerEvents: "none",
};

const POINT_INTERACTIVE_STYLE: CSSProperties = {
  cursor: "pointer",
  pointerEvents: "auto",
};

const POINT_STATIC_STYLE: CSSProperties = { pointerEvents: "none" };

// The one styled block that stays: an SVG <g> keyboard focus ring. See the
// justified biome-ignore on the styled-components import at the top of the
// file.
const InteractiveMarker = styled.g`
  outline: none;
  .focus-ring {
    visibility: hidden;
  }
  &:focus-visible .focus-ring {
    visibility: visible;
  }
`;
