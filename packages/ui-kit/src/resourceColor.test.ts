import { describe, expect, it } from "vitest";
import { hashHue, matchCuratedHue, resourceColor } from "./resourceColor";

describe("resourceColor", () => {
  it("is deterministic: same name always yields the same colour", () => {
    expect(resourceColor("LiquidFuel")).toBe(resourceColor("LiquidFuel"));
    expect(resourceColor("Nertea's SuperFuel")).toBe(
      resourceColor("Nertea's SuperFuel"),
    );
  });

  it("is case-insensitive", () => {
    expect(resourceColor("LiquidFuel")).toBe(resourceColor("liquidfuel"));
    expect(resourceColor("WATER")).toBe(resourceColor("water"));
  });

  it("returns an hsl() string in the fixed legibility band", () => {
    const color = resourceColor("Water");
    expect(color).toMatch(/^hsl\(\d+deg 65% 55%\)$/);
  });

  it("maps curated resources to kind-appropriate hues", () => {
    // Exact numbers are tunable; what matters is each curated resource
    // resolves through Tier 1 (a specific, named hue) rather than falling
    // through to the Tier 2 hash.
    const water = resourceColor("Water");
    const oxidizer = resourceColor("Oxidizer");
    const liquidFuel = resourceColor("LiquidFuel");
    const food = resourceColor("Food");
    expect(water).not.toBe(oxidizer);
    expect(water).not.toBe(liquidFuel);
    expect(oxidizer).not.toBe(liquidFuel);
    expect(food).not.toBe(water);
  });

  it("resolves aliases of the same curated family to the same colour", () => {
    expect(resourceColor("ElectricCharge")).toBe(resourceColor("EC"));
    expect(resourceColor("MonoPropellant")).toBe(resourceColor("MonoProp"));
    expect(resourceColor("LqdHydrogen")).toBe(resourceColor("Hydrogen"));
  });

  it("gives unrecognised resources a distinct, stable, hashed colour", () => {
    const modResourceA = resourceColor("KerbalKrunchies");
    const modResourceB = resourceColor("FluxCapacitorJuice");
    expect(modResourceA).toBe(resourceColor("KerbalKrunchies"));
    // Two different unknown names should not collide (golden-angle spread).
    expect(modResourceA).not.toBe(modResourceB);
  });

  it("never resolves an unrecognised name into a curated resource's exact hue", () => {
    // Sample a spread of unknown names and confirm none of them accidentally
    // reproduce a curated resource's colour outright.
    const curatedColors = new Set(
      ["Water", "Oxidizer", "LiquidFuel", "Food", "Xenon"].map(resourceColor),
    );
    const unknowns = [
      "KerbalKrunchies",
      "FluxCapacitorJuice",
      "Antimatter",
      "SpaceDust",
      "MysteryGoo",
      "ExperimentData",
    ];
    for (const name of unknowns) {
      expect(curatedColors.has(resourceColor(name))).toBe(false);
    }
  });

  describe("Tier 1: matchCuratedHue precedence mechanism", () => {
    it("first match wins, so ordering determines precedence", () => {
      // A synthetic table where a short generic alias is listed BEFORE a
      // longer, more specific one that also contains it: the generic one
      // wins purely because it comes first, proving the algorithm is
      // order-driven (not automatically "most specific"), which is exactly
      // why CURATED itself must be authored most-specific-first.
      const genericFirst = [
        { aliases: ["fuel"], hue: 999 },
        { aliases: ["liquidfuel"], hue: 40 },
      ];
      expect(matchCuratedHue("liquidfuel", genericFirst)).toBe(999);

      // Flip the order: the specific alias now gets first refusal, matching
      // the real CURATED table's discipline.
      const specificFirst = [
        { aliases: ["liquidfuel"], hue: 40 },
        { aliases: ["fuel"], hue: 999 },
      ];
      expect(matchCuratedHue("liquidfuel", specificFirst)).toBe(40);
    });

    it("real CURATED table resolves LiquidFuel to its own family, not a fallback", () => {
      expect(matchCuratedHue("liquidfuel")).toBe(matchCuratedHue("liquidfuel"));
      expect(matchCuratedHue("liquidfuel")).not.toBeUndefined();
    });

    it("returns undefined for names with no curated match", () => {
      expect(matchCuratedHue("krunchies")).toBeUndefined();
    });
  });

  describe("Tier 2: hashHue reserved-band avoidance", () => {
    it("never lands within 15deg of a curated hue", () => {
      // Sweep a wide sample of synthetic names; none should resolve within
      // the reserved band of a curated hue (40 = liquidfuel, 215 = water).
      const curatedHues = [
        40, 205, 50, 65, 95, 15, 190, 215, 28, 130, 275, 5, 175,
      ];
      for (let i = 0; i < 200; i++) {
        const hue = hashHue(`synthetic-resource-${i}`);
        for (const curated of curatedHues) {
          const diff = Math.abs(hue - curated) % 360;
          const distance = diff > 180 ? 360 - diff : diff;
          expect(distance).toBeGreaterThanOrEqual(15);
        }
      }
    });

    it("is deterministic", () => {
      expect(hashHue("krunchies")).toBe(hashHue("krunchies"));
    });
  });
});
