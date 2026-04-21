import { describe, expect, it } from "vitest";
import { alignXY } from "./align";

describe("alignXY", () => {
  it("returns empty for empty inputs", () => {
    expect(alignXY({ t: [], v: [] }, { t: [], v: [] })).toEqual({ x: [], y: [] });
  });

  it("pairs same-tick samples via nearest-prior match", () => {
    // Two keys from the same tick land a few ms apart; alignXY pairs them.
    const xs = { t: [1000, 2000, 3000], v: [10, 20, 30] };
    const ys = { t: [1002, 2001, 3003], v: [100, 200, 300] };
    const out = alignXY(ys, xs);
    expect(out).toEqual({ x: [10, 20, 30], y: [100, 200, 300] });
  });

  it("drops Y samples with no prior X within the tolerance", () => {
    // First Y arrives before any X; second Y has a prior X in window.
    const xs = { t: [500], v: [5] };
    const ys = { t: [100, 600], v: [1, 2] };
    const out = alignXY(ys, xs);
    expect(out).toEqual({ x: [5], y: [2] });
  });

  it("drops Y samples when the nearest X is older than the tolerance", () => {
    const xs = { t: [0], v: [99] };
    const ys = { t: [2000], v: [1] }; // 2s gap > 1s tolerance
    const out = alignXY(ys, xs, 1000);
    expect(out).toEqual({ x: [], y: [] });
  });

  it("uses the newest prior X when multiple are available", () => {
    const xs = { t: [1000, 1100, 1200], v: [10, 11, 12] };
    const ys = { t: [1150], v: [999] };
    const out = alignXY(ys, xs);
    expect(out).toEqual({ x: [11], y: [999] });
  });

  it("allows a custom tolerance", () => {
    const xs = { t: [0], v: [7] };
    const ys = { t: [5000], v: [1] };
    expect(alignXY(ys, xs, 10_000)).toEqual({ x: [7], y: [1] });
    expect(alignXY(ys, xs, 1_000)).toEqual({ x: [], y: [] });
  });
});
