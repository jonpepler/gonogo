import { describe, expect, it } from "vitest";
import { deadlineAxis } from "./axis";
import type { TrackerDeadline } from "./deadlines";

const row = (
  kind: TrackerDeadline["kind"],
  atUt: number | null,
): TrackerDeadline => ({
  kind,
  label: kind,
  question: kind,
  owner: kind === "operational" ? "life support" : "comms",
  atUt,
  basis: "test",
});

/**
 * The one place the three deadlines share a scale. Its entire job is to make
 * their ORDER visible; it draws no conclusion from that order, and there is
 * deliberately no "is this bad" anywhere in the model it returns.
 */
describe("deadlineAxis", () => {
  const nowUt = 1000;

  it("plots every dated deadline on one shared scale", () => {
    const axis = deadlineAxis(
      [
        row("geometric", 1200),
        row("operational", 1600),
        row("declaration", 2000),
      ],
      nowUt,
    );
    expect(axis?.marks.map((m) => m.kind)).toEqual([
      "geometric",
      "operational",
      "declaration",
    ]);
    expect(axis?.marks.map((m) => m.fraction)).toEqual([0.2, 0.6, 1]);
  });

  it("spans from now to the furthest deadline", () => {
    const axis = deadlineAxis(
      [row("geometric", 1200), row("declaration", 2000)],
      nowUt,
    );
    expect(axis?.fromUt).toBe(1000);
    expect(axis?.toUt).toBe(2000);
    expect(axis?.nowFraction).toBe(0);
  });

  it("keeps a deadline that has already passed on the axis, and moves now along it", () => {
    // A craft past its predicted return is exactly when the ordering matters
    // most; dropping the passed mark would hide the thing worth seeing.
    const axis = deadlineAxis(
      [row("geometric", 800), row("declaration", 1200)],
      nowUt,
    );
    expect(axis?.fromUt).toBe(800);
    expect(axis?.toUt).toBe(1200);
    expect(axis?.marks.map((m) => m.fraction)).toEqual([0, 1]);
    expect(axis?.nowFraction).toBe(0.5);
  });

  it("leaves out deadlines with no UT rather than plotting them at now", () => {
    const axis = deadlineAxis(
      [
        row("geometric", 1200),
        row("operational", null),
        row("declaration", 2000),
      ],
      nowUt,
    );
    expect(axis?.marks.map((m) => m.kind)).toEqual([
      "geometric",
      "declaration",
    ]);
  });

  it("draws no axis when only one deadline is known", () => {
    // An axis with a single mark shows no ordering, so it would be decoration
    // pretending to be information.
    expect(
      deadlineAxis([row("geometric", 1200), row("operational", null)], nowUt),
    ).toBeNull();
  });

  it("draws no axis when nothing is known at all", () => {
    expect(
      deadlineAxis([row("geometric", null), row("declaration", null)], nowUt),
    ).toBeNull();
  });

  it("survives two deadlines falling at the same instant", () => {
    const axis = deadlineAxis(
      [row("geometric", 1500), row("declaration", 1500)],
      nowUt,
    );
    expect(axis?.marks.map((m) => m.fraction)).toEqual([1, 1]);
  });

  it("survives every deadline falling exactly at now", () => {
    const axis = deadlineAxis(
      [row("geometric", 1000), row("declaration", 1000)],
      nowUt,
    );
    expect(axis?.marks.every((m) => Number.isFinite(m.fraction))).toBe(true);
  });
});
