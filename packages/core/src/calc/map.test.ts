import { describe, expect, it } from "vitest";
import { mapClamped } from "./map";

describe("mapClamped", () => {
  it("maps a value linearly between ranges", () => {
    expect(mapClamped(5, 0, 10, 0, 100)).toBe(50);
  });

  it("clamps below the output minimum", () => {
    expect(mapClamped(-5, 0, 10, 0, 100)).toBe(0);
  });

  it("clamps above the output maximum", () => {
    expect(mapClamped(15, 0, 10, 0, 100)).toBe(100);
  });

  it("maps the input minimum to the output minimum", () => {
    expect(mapClamped(0, 0, 10, 20, 80)).toBe(20);
  });

  it("maps the input maximum to the output maximum", () => {
    expect(mapClamped(10, 0, 10, 20, 80)).toBe(80);
  });

  it("works with a reversed output range", () => {
    expect(mapClamped(5, 0, 10, 100, 0)).toBe(50);
    expect(mapClamped(-1, 0, 10, 100, 0)).toBe(100);
    expect(mapClamped(11, 0, 10, 100, 0)).toBe(0);
  });
});
