import type { CSSProperties, KeyboardEvent } from "react";
import { useMemo } from "react";
// InteractiveMarker below is a styled.g whose keyboard focus ring
// (`&:focus-visible .focus-ring`) is an SVG pseudo-class + descendant rule
// that inline `style` cannot express, and no ui-kit primitive is an SVG <g>
// focus wrapper. Same pattern as `ShipMap/ShipDiagramSvg.tsx`'s `PartGroup`.
// Shared by both interactive shapes (point markers and, since Task 5,
// vessel orbit-path rings) and the travelling-pulse's own looping CSS
// animation (`keyframes`, same reduced-motion-guarded pattern as
// `ui-kit/StatusIndicator.tsx`'s pulsing dot).
// biome-ignore lint/style/noRestrictedImports: SVG <g> focus ring + keyframes animation, no inline/primitive equivalent (see above)
import { keyframes, styled } from "styled-components";
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
      // `dotX`/`dotY` come from `projectEntityPosition`, which (via
      // `bodyPosition`) already bakes lan+argPe+trueAnomaly into an
      // ABSOLUTE point, unlike the ellipse's own `cx`/`cy`/`rotationDeg`
      // (an UNROTATED local frame the caller rotates via the wrapping `<g>`,
      // see `projectOrbitRing`'s doc comment). Nesting the dot inside that
      // same rotated `<g>` would rotate an already-rotated point a second
      // time, so it renders as a sibling instead, outside the transform.
      const dot =
        r.dotX != null && r.dotY != null ? (
          <circle
            cx={r.dotX}
            cy={r.dotY}
            r={ORBIT_DOT_RADIUS_PX}
            fill={r.colour}
            fillOpacity={r.opacity}
            pointerEvents="none"
            data-entity-dot-id={r.id}
          />
        ) : null;
      const interactive = onActivate !== undefined && r.vesselId != null;
      if (!interactive) {
        return (
          <>
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
            {dot}
          </>
        );
      }
      const activate = () => onActivate?.(r.id);
      return (
        <>
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
          {dot}
        </>
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
    case "travelling-pulse": {
      const dx = r.x2 - r.x1;
      const dy = r.y2 - r.y1;
      const fullLengthPx = Math.hypot(dx, dy);
      if (!(fullLengthPx > 0)) return null;
      const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const segmentLengthPx = Math.min(r.segmentLengthPx, fullLengthPx);
      // How far the segment's OWN local origin (its trailing end) travels
      // before its leading end reaches the tip: keeps the whole segment
      // inside the apex->tip span for the entire loop, never overshooting.
      const travelPx = fullLengthPx - segmentLengthPx;
      return (
        // Static positioning (SVG `transform` ATTRIBUTE) lives on its own
        // outer `<g>`, never the same element as the CSS-animated one: SVG2
        // treats `transform` as CSS-stylable, so a CSS `transform` (the
        // animation's `translateX`) doesn't compose with the attribute, it
        // REPLACES it outright. Splitting the two into outer (attribute) /
        // inner (CSS animation, in the outer's already-rotated local frame)
        // is what keeps the segment anchored at the apex and pointed along
        // the bearing once the animation is actually running.
        <g
          transform={`translate(${r.x1} ${r.y1}) rotate(${angleDeg})`}
          pointerEvents="none"
          data-entity-id={r.id}
        >
          <TravellingPulseGroup
            style={{ "--pulse-travel-px": `${travelPx}px` } as CSSProperties}
          >
            <line
              x1={0}
              y1={0}
              x2={segmentLengthPx}
              y2={0}
              stroke={r.colour}
              strokeOpacity={r.opacity}
              strokeWidth={TRAVELLING_PULSE_STROKE_WIDTH_PX}
              strokeLinecap="round"
            />
          </TravellingPulseGroup>
        </g>
      );
    }
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

/** Radius of the small marker `SystemEntitiesLayer` draws at an `orbit-path`
 *  entity's own declared position (its anomaly), alongside the ring itself:
 *  the ring shows the orbit's SHAPE, this marks WHERE on it the entity's
 *  data actually points (e.g. the same point a `connection-line` joins to),
 *  so a linked vessel reads as "here", not just "somewhere on this ring". */
const ORBIT_DOT_RADIUS_PX = 2.5;

/** Half-width, in `t` units along the edge, of the pulse's bright band: a
 *  travelling gradient highlight rather than a discrete marker, so command
 *  traffic can't be mistaken for a vessel point riding the line. */
const PULSE_BAND_T = 0.14;
/** Gradient band ends: same faint grey the CommNet lines themselves already
 *  draw in (`EMPHASIS_COLOUR.faint`, `systemEntities.ts`), so the sweep
 *  reads as a highlight moving along the line rather than a new colour. */
const PULSE_BASE_COLOUR = "var(--color-text-faint)";
/** Gradient band peak: a dim, desaturated white (`--color-text-primary`,
 *  the body-text token), brighter than the faint base so the sweep still
 *  reads as a highlight, but deliberately NOT the bright accent green:
 *  that colour is reserved for "selected/active" state elsewhere in this
 *  layer (focus rings, the active vessel's own marker), and traffic riding
 *  the same hue read as a second selection signal rather than motion. */
const PULSE_PEAK_COLOUR = "var(--color-text-primary)";
/** Thin: a light sweep riding the line, not a fat marker that could be
 *  mistaken for a vessel point or an orbit ring (`connection-line`'s own
 *  1.4px, `orbit-path`'s 1.2px). */
const PULSE_STROKE_WIDTH_PX = 1.2;

/** How far a travelling-pulse segment's local origin (its trailing end)
 *  slides per loop, set per-instance via the `--pulse-travel-px` custom
 *  property (`Primitive`'s "travelling-pulse" case): the fixed distance,
 *  0% opaque, ramping in, holding, then ramping out again before the
 *  instant snap back to the start, so the loop reads as a repeating sweep
 *  rather than a visible jump-cut. The PERIOD is a fixed decorative
 *  constant, not derived from any real transit time: a contribution has no
 *  wall clock to compute one from (see `systemEntities.ts`'s
 *  `travelling-pulse` doc comment). */
const travellingPulseKeyframes = keyframes`
  0% { transform: translateX(0); opacity: 0; }
  8% { opacity: 1; }
  92% { opacity: 1; }
  100% { transform: translateX(var(--pulse-travel-px, 0px)); opacity: 0; }
`;
const TRAVELLING_PULSE_PERIOD_MS = 4000;
const TRAVELLING_PULSE_STROKE_WIDTH_PX = 2;

const TravellingPulseGroup = styled.g`
  @media (prefers-reduced-motion: no-preference) {
    animation: ${travellingPulseKeyframes} ${TRAVELLING_PULSE_PERIOD_MS}ms
      var(--ease-linear, linear) infinite;
  }
`;

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
