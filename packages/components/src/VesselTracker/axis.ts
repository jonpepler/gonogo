import type { DeadlineKind, TrackerDeadline } from "./deadlines";

/**
 * The three deadlines placed on ONE shared scale, which is the only way their
 * relative order is visible at a glance. The spec asks for exactly this and
 * for nothing more from it: the axis shows that the operational limit falls
 * before the geometric return, and the operator draws the conclusion. Nothing
 * in this model ranks, scores, or flags an ordering.
 *
 * Sharing a scale is also what stops the rows being read as one number: three
 * marks at three positions is a picture that cannot collapse to a countdown.
 */
export interface AxisMark {
  kind: DeadlineKind;
  atUt: number;
  /** Position along the axis, 0 at `fromUt` and 1 at `toUt`. */
  fraction: number;
}

export interface DeadlineAxis {
  fromUt: number;
  toUt: number;
  /** Where the view clock sits on the same scale, so a passed deadline reads as passed. */
  nowFraction: number;
  marks: readonly AxisMark[];
}

/**
 * Null when fewer than two deadlines have a UT: a single mark shows no
 * ordering, so an axis drawn for it would be decoration dressed as
 * information.
 */
export function deadlineAxis(
  rows: readonly TrackerDeadline[],
  nowUt: number,
): DeadlineAxis | null {
  const dated = rows.filter(
    (r): r is TrackerDeadline & { atUt: number } => r.atUt != null,
  );
  if (dated.length < 2) return null;

  const uts = dated.map((r) => r.atUt);
  // A deadline that has already passed still plots: that is precisely when the
  // ordering is worth looking at, so the span opens back to include it and
  // `now` moves along the axis instead.
  const fromUt = Math.min(nowUt, ...uts);
  const toUt = Math.max(nowUt, ...uts);
  const span = toUt - fromUt;
  const at = (ut: number) => (span === 0 ? 0 : (ut - fromUt) / span);

  return {
    fromUt,
    toUt,
    nowFraction: at(nowUt),
    marks: dated.map((r) => ({
      kind: r.kind,
      atUt: r.atUt,
      fraction: at(r.atUt),
    })),
  };
}
