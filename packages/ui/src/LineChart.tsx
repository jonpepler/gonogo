import React, { useMemo } from "react";
import {
  buildPath,
  formatTimeLabel,
  makeScale,
  niceTicks,
} from "./lineChartMath";

export interface SeriesRange<V = unknown> {
  t: number[];
  v: V[];
}

export interface ChartSeries {
  id: string;
  label: string;
  axis: "primary" | "secondary";
  color: string;
  data: SeriesRange<number>;
}

export interface LineChartProps {
  series: ChartSeries[];
  /** x-domain in unix ms. */
  xDomain: [number, number];
  yDomainPrimary?: [number, number];
  yDomainSecondary?: [number, number];
  width: number;
  height: number;
}

const MARGIN = { top: 10, right: 50, bottom: 28, left: 50 };
const TICK_COUNT = 5;
const FONT = "11px monospace";

export function LineChart({
  series,
  xDomain,
  yDomainPrimary,
  yDomainSecondary,
  width,
  height,
}: Readonly<LineChartProps>) {
  const w = width;
  const h = height;
  const plotX0 = MARGIN.left;
  const plotX1 = w - MARGIN.right;
  const plotY0 = MARGIN.top;
  const plotY1 = h - MARGIN.bottom;
  const plotW = plotX1 - plotX0;
  const plotH = plotY1 - plotY0;

  const primarySeries = series.filter((s) => s.axis === "primary" && s.data.t.length > 0);
  const secondarySeries = series.filter((s) => s.axis === "secondary" && s.data.t.length > 0);
  const hasSecondary = secondarySeries.length > 0;

  const primaryDomain = useMemo((): [number, number] => {
    if (yDomainPrimary) return yDomainPrimary;
    if (primarySeries.length === 0) return [0, 1];
    const all = primarySeries.flatMap((s) => s.data.v);
    return [Math.min(...all), Math.max(...all)];
  }, [primarySeries, yDomainPrimary]);

  const secondaryDomain = useMemo((): [number, number] => {
    if (yDomainSecondary) return yDomainSecondary;
    if (secondarySeries.length === 0) return [0, 1];
    const all = secondarySeries.flatMap((s) => s.data.v);
    return [Math.min(...all), Math.max(...all)];
  }, [secondarySeries, yDomainSecondary]);

  const scaleX = makeScale(xDomain[0], xDomain[1], plotX0, plotX1);
  const scaleYPrimary = makeScale(primaryDomain[0], primaryDomain[1], plotY1, plotY0);
  const scaleYSecondary = makeScale(secondaryDomain[0], secondaryDomain[1], plotY1, plotY0);

  const xSpan = xDomain[1] - xDomain[0];
  const xTicks = niceTicks(xDomain[0], xDomain[1], TICK_COUNT);
  const yTicksPrimary = niceTicks(primaryDomain[0], primaryDomain[1], TICK_COUNT);
  const yTicksSecondary = hasSecondary
    ? niceTicks(secondaryDomain[0], secondaryDomain[1], TICK_COUNT)
    : [];

  const paths = useMemo(() => {
    return series
      .filter((s) => s.data.t.length > 0)
      .map((s) => {
        const scaleY = s.axis === "primary" ? scaleYPrimary : scaleYSecondary;
        return {
          id: s.id,
          color: s.color,
          d: buildPath(s.data.t, s.data.v, scaleX, scaleY),
        };
      });
  }, [series, scaleX, scaleYPrimary, scaleYSecondary]);

  return (
    <svg
      width={w}
      height={h}
      style={{ fontFamily: "monospace", overflow: "visible" }}
    >
      {/* Background */}
      <rect x={plotX0} y={plotY0} width={plotW} height={plotH} fill="#111" />

      {/* Horizontal grid lines + left y-axis ticks */}
      {yTicksPrimary.map((tick) => {
        const y = scaleYPrimary(tick);
        return (
          <React.Fragment key={`py-${tick}`}>
            <line
              x1={plotX0}
              y1={y}
              x2={plotX1}
              y2={y}
              stroke="#222"
              strokeWidth={1}
            />
            <text
              x={plotX0 - 4}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fill="#555"
              fontSize={11}
            >
              {formatYTick(tick)}
            </text>
          </React.Fragment>
        );
      })}

      {/* Right y-axis ticks (secondary) */}
      {yTicksSecondary.map((tick) => {
        const y = scaleYSecondary(tick);
        return (
          <text
            key={`sy-${tick}`}
            x={plotX1 + 4}
            y={y}
            textAnchor="start"
            dominantBaseline="middle"
            fill="#555"
            fontSize={11}
          >
            {formatYTick(tick)}
          </text>
        );
      })}

      {/* Vertical grid lines + x-axis ticks */}
      {xTicks.map((tick) => {
        const x = scaleX(tick);
        return (
          <React.Fragment key={`xt-${tick}`}>
            <line
              x1={x}
              y1={plotY0}
              x2={x}
              y2={plotY1}
              stroke="#222"
              strokeWidth={1}
            />
            <text
              x={x}
              y={plotY1 + 14}
              textAnchor="middle"
              fill="#555"
              fontSize={11}
            >
              {formatTimeLabel(tick - xDomain[0], xSpan)}
            </text>
          </React.Fragment>
        );
      })}

      {/* Axis borders */}
      <line x1={plotX0} y1={plotY0} x2={plotX0} y2={plotY1} stroke="#333" strokeWidth={1} />
      <line x1={plotX0} y1={plotY1} x2={plotX1} y2={plotY1} stroke="#333" strokeWidth={1} />
      {hasSecondary && (
        <line x1={plotX1} y1={plotY0} x2={plotX1} y2={plotY1} stroke="#333" strokeWidth={1} />
      )}

      {/* Series paths */}
      {paths.map(({ id, color, d }) => (
        <path
          key={id}
          d={d}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Series labels (top-left legend) */}
      {series.map((s, i) => (
        <text
          key={s.id}
          x={plotX0 + 6}
          y={plotY0 + 14 + i * 16}
          fill={s.color}
          fontSize={10}
        >
          {s.label}
        </text>
      ))}
    </svg>
  );
}

function formatYTick(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
