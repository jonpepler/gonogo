/** Pure math helpers for LineChart. No React, no side-effects. */

/** Linear scale: maps input domain to output pixel range. */
export function makeScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): (v: number) => number {
  const span = domainMax - domainMin;
  if (span === 0) {
    const mid = (rangeMin + rangeMax) / 2;
    return () => mid;
  }
  return (v) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin);
}

/**
 * Nice round tick values for a numeric axis.
 * Returns exactly `count` evenly-spaced ticks.
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (min === max) {
    return Array.from({ length: count }, () => min);
  }
  const span = max - min;
  const rawStep = span / (count - 1);
  // Round step to a "nice" magnitude
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const nice = [1, 2, 2.5, 5, 10].find((m) => m * mag >= rawStep) ?? 10;
  const step = nice * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let i = 0; ticks.length < count; i++) {
    const t = start + i * step;
    if (t > max + step * 0.01) break;
    ticks.push(t);
  }
  return ticks.length >= 2 ? ticks : [min, max];
}

/** Format an x-axis timestamp. Uses mm:ss unless the span exceeds 1 hour. */
export function formatTimeLabel(t: number, spanMs: number): string {
  const s = Math.floor(t / 1000);
  if (spanMs >= 3_600_000) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** Build an SVG path `d` string from x/y arrays run through scale functions. */
export function buildPath(
  ts: number[],
  vs: number[],
  scaleX: (v: number) => number,
  scaleY: (v: number) => number,
): string {
  if (ts.length === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < ts.length; i++) {
    const x = scaleX(ts[i]).toFixed(2);
    const y = scaleY(vs[i]).toFixed(2);
    parts.push(`${i === 0 ? "M" : "L"}${x},${y}`);
  }
  return parts.join(" ");
}
