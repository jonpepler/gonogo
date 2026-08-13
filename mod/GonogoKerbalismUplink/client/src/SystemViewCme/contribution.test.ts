import { describe, expect, it } from "vitest";
import { computeCmeEntities } from "./contribution";

/** A vessel-to-star unit vector pointing straight along +x (i.e. the star
 *  sits at the vessel's +x): the negated bearing this produces (star-to-
 *  vessel) is -x, so a storm on this star plumes toward -x, distance `dist`. */
function starDirection(x: number, y: number, z: number) {
  return {
    star: "Kerbol",
    direction: {
      x: { magnitude: x },
      y: { magnitude: y },
      z: { magnitude: z },
    },
  };
}

describe("computeCmeEntities", () => {
  it("renders nothing when there is no space-weather payload (Kerbalism absent)", () => {
    expect(computeCmeEntities(undefined)).toEqual([]);
  });

  it("renders nothing when there are no storms", () => {
    expect(computeCmeEntities({})).toEqual([]);
    expect(computeCmeEntities({ storms: [] })).toEqual([]);
  });

  it("skips a storm slot with stormState 0 (none)", () => {
    expect(
      computeCmeEntities({
        storms: [{ star: "Kerbol", stormState: { magnitude: 0 } }],
      }),
    ).toEqual([]);
  });

  it("skips a storm slot missing its star name or distance", () => {
    expect(
      computeCmeEntities({
        stars: [starDirection(1, 0, 0)],
        storms: [{ stormState: { magnitude: 1 }, dist: { magnitude: 1e10 } }],
      }),
    ).toEqual([]);
    expect(
      computeCmeEntities({
        stars: [starDirection(1, 0, 0)],
        storms: [{ star: "Kerbol", stormState: { magnitude: 1 } }],
      }),
    ).toEqual([]);
    expect(
      computeCmeEntities({
        stars: [starDirection(1, 0, 0)],
        storms: [
          {
            star: "Kerbol",
            stormState: { magnitude: 1 },
            dist: { magnitude: 0 },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("skips a storm slot when `stars` has no matching bearing (defensive: shouldn't happen on the real wire)", () => {
    expect(
      computeCmeEntities({
        storms: [
          {
            star: "Kerbol",
            stormState: { magnitude: 1 },
            dist: { magnitude: 13_599_840_256 },
          },
        ],
      }),
    ).toEqual([]);
    // A `stars` entry for a DIFFERENT star doesn't count.
    expect(
      computeCmeEntities({
        stars: [starDirection(1, 0, 0)].map((s) => ({
          ...s,
          star: "Kerbol B",
        })),
        storms: [
          {
            star: "Kerbol",
            stormState: { magnitude: 1 },
            dist: { magnitude: 13_599_840_256 },
          },
        ],
      }),
    ).toEqual([]);
    // A zero direction vector can't form a bearing either.
    expect(
      computeCmeEntities({
        stars: [starDirection(0, 0, 0)],
        storms: [
          {
            star: "Kerbol",
            stormState: { magnitude: 1 },
            dist: { magnitude: 13_599_840_256 },
          },
        ],
      }),
    ).toEqual([]);
  });

  it("draws a faint directional plume from the star toward the body's bearing, for an inbound storm (stormState 1)", () => {
    const [entity] = computeCmeEntities({
      stormEjectionSpeed: { magnitude: 99_000_000 },
      stars: [starDirection(1, 0, 0)],
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 1 },
          stormTime: { magnitude: 5_000_000 },
          stormDuration: { magnitude: 3_600 },
          dist: { magnitude: 13_599_840_256 },
        },
      ],
    });
    expect(entity).toEqual({
      id: "cme:Kerbol",
      position: { kind: "fixed", parentName: "Kerbol", xMetres: 0, yMetres: 0 },
      shape: {
        kind: "plume",
        // direction (1,0,0) negated -> bearing (-1,0) * dist.
        to: {
          kind: "fixed",
          parentName: "Kerbol",
          xMetres: -13_599_840_256,
          yMetres: 0,
        },
        halfWidthMetres: 13_599_840_256 * 0.18,
      },
      style: { emphasis: "faint" },
      meta: {
        star: "Kerbol",
        state: "inbound",
        distM: 13_599_840_256,
        arrivalUt: 5_000_000,
        durationS: 3_600,
        ejectionSpeedMps: 99_000_000,
      },
    });
  });

  it("projects the bearing off the direction vector's x/z only, dropping y (this diagram's own flattened plane)", () => {
    const [entity] = computeCmeEntities({
      // Straight "up" (y) plus a unit x component: only x/z should reach
      // the bearing, y is dropped entirely, not folded into the magnitude.
      stars: [starDirection(0, 5, 0)].map((s) => ({
        ...s,
        direction: {
          x: { magnitude: 0 },
          y: { magnitude: 5 },
          z: { magnitude: 0 },
        },
      })),
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 1 },
          dist: { magnitude: 1e10 },
        },
      ],
    });
    // x and z both zero -> no planar bearing -> skipped, never a fabricated one.
    expect(entity).toBeUndefined();
  });

  it("tints an arrived storm (stormState 2) with the warn colour, still faint", () => {
    const [entity] = computeCmeEntities({
      stars: [starDirection(1, 0, 0)],
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 2 },
          dist: { magnitude: 13_599_840_256 },
        },
      ],
    });
    expect(entity?.style).toEqual({
      emphasis: "faint",
      colour: "var(--color-status-warning-fg-muted)",
    });
    expect(entity?.meta?.state).toBe("in progress");
  });

  it("never sets a zHint: relies on the plume shape's own default layer (below connection-line/point, above orbit-path)", () => {
    const [entity] = computeCmeEntities({
      stars: [starDirection(1, 0, 0)],
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 1 },
          dist: { magnitude: 1e10 },
        },
      ],
    });
    expect(entity?.shape.kind).toBe("plume");
    expect(entity?.zHint).toBeUndefined();
  });

  it("draws one entity per storm slot, e.g. a modded binary star", () => {
    const entities = computeCmeEntities({
      stars: [
        starDirection(1, 0, 0),
        { ...starDirection(0, 0, 1), star: "Kerbol B" },
      ],
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 1 },
          dist: { magnitude: 1e10 },
        },
        {
          star: "Kerbol B",
          stormState: { magnitude: 2 },
          dist: { magnitude: 2e10 },
        },
      ],
    });
    expect(entities.map((e) => e.id)).toEqual(["cme:Kerbol", "cme:Kerbol B"]);
  });
});
