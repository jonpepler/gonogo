import { describe, expect, it } from "vitest";
import { computeCmeEntities } from "./contribution";

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
        storms: [{ stormState: { magnitude: 1 }, dist: { magnitude: 1e10 } }],
      }),
    ).toEqual([]);
    expect(
      computeCmeEntities({
        storms: [{ star: "Kerbol", stormState: { magnitude: 1 } }],
      }),
    ).toEqual([]);
    expect(
      computeCmeEntities({
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

  it("draws a faint blob at the star for an inbound storm (stormState 1)", () => {
    const [entity] = computeCmeEntities({
      stormEjectionSpeed: { magnitude: 99_000_000 },
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
      shape: { kind: "blob", radiusMetres: 13_599_840_256 },
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

  it("tints an arrived storm (stormState 2) with the warn colour, still faint", () => {
    const [entity] = computeCmeEntities({
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
      colour: "var(--color-status-warn-fg)",
    });
    expect(entity?.meta?.state).toBe("in progress");
  });

  it("never sets a zHint: relies on the blob shape's own default layer (below connection-line/point, above orbit-path)", () => {
    const [entity] = computeCmeEntities({
      storms: [
        {
          star: "Kerbol",
          stormState: { magnitude: 1 },
          dist: { magnitude: 1e10 },
        },
      ],
    });
    expect(entity?.shape.kind).toBe("blob");
    expect(entity?.zHint).toBeUndefined();
  });

  it("draws one entity per storm slot, e.g. a modded binary star", () => {
    const entities = computeCmeEntities({
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
