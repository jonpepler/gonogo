import { describe, expect, it } from "vitest";
import {
  CURATED_BANDS,
  hashHue,
  matchCuratedHue,
  placedHue,
  resourceColor,
} from "./resourceColor";

/** Local mirror of the module's own circular-distance helper, kept private
 *  there on purpose; tests need it to reason about band membership. */
function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

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
    // resolves through Tier 1 (a specific, named band) rather than falling
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

  it("resolves aliases of the same curated family into that family's band", () => {
    // ElectricCharge/EC etc are different full strings, so each now gets its
    // OWN deterministic in-band placement rather than an identical exact
    // hue: the invariant that survives band placement is "same band", not
    // "same point in the band".
    const assertSameBand = (nameA: string, nameB: string) => {
      const keyA = nameA.toLowerCase();
      const keyB = nameB.toLowerCase();
      const hueA = placedHue(keyA);
      const hueB = placedHue(keyB);
      expect(hueA).not.toBeUndefined();
      expect(hueB).not.toBeUndefined();
      const band = CURATED_BANDS.find((candidate) =>
        candidate.aliases.some((alias) => keyA.includes(alias)),
      );
      expect(band).not.toBeUndefined();
      expect(hueDistance(hueA as number, band!.centre)).toBeLessThanOrEqual(
        band!.spread,
      );
      expect(hueDistance(hueB as number, band!.centre)).toBeLessThanOrEqual(
        band!.spread,
      );
    };
    assertSameBand("ElectricCharge", "EC");
    assertSameBand("MonoPropellant", "MonoProp");
    assertSameBand("LqdHydrogen", "Hydrogen");
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

  describe("Tier 1: hue-band auto-spread", () => {
    it("spreads three distinct waste-family resources into three distinct in-band hues", () => {
      // Waste, WasteWater and CarbonDioxide are three different real
      // resources that share the ["carbondioxide","co2","waste"] family
      // (a single family, not split into hand-picked hues); each must land
      // at its own point inside the band, not collapse onto one shared hue.
      const wasteBand = CURATED_BANDS.find((band) =>
        band.aliases.includes("waste"),
      );
      expect(wasteBand).not.toBeUndefined();

      const waste = placedHue("waste") as number;
      const wasteWater = placedHue("wastewater") as number;
      const carbonDioxide = placedHue("carbondioxide") as number;

      for (const hue of [waste, wasteWater, carbonDioxide]) {
        expect(hueDistance(hue, wasteBand!.centre)).toBeLessThanOrEqual(
          wasteBand!.spread,
        );
      }

      // Pairwise distinct by a sensible margin, not just "not bitwise equal".
      const MIN_SEPARATION_DEG = 1;
      expect(hueDistance(waste, wasteWater)).toBeGreaterThan(
        MIN_SEPARATION_DEG,
      );
      expect(hueDistance(waste, carbonDioxide)).toBeGreaterThan(
        MIN_SEPARATION_DEG,
      );
      expect(hueDistance(wasteWater, carbonDioxide)).toBeGreaterThan(
        MIN_SEPARATION_DEG,
      );
    });

    it("keeps WasteWater inside the waste band, not water's band", () => {
      // "wastewater" contains "waste" (the waste family is ordered ahead of
      // water in CURATED), so it must resolve as an olive-band member, never
      // as blue.
      const wasteBand = CURATED_BANDS.find((band) =>
        band.aliases.includes("waste"),
      );
      const waterBand = CURATED_BANDS.find((band) =>
        band.aliases.includes("water"),
      );
      expect(wasteBand).not.toBeUndefined();
      expect(waterBand).not.toBeUndefined();

      const wasteWaterHue = placedHue("wastewater") as number;
      expect(hueDistance(wasteWaterHue, wasteBand!.centre)).toBeLessThanOrEqual(
        wasteBand!.spread,
      );
      expect(hueDistance(wasteWaterHue, waterBand!.centre)).toBeGreaterThan(
        wasteBand!.spread,
      );
    });

    it("is deterministic: same resource name always places at the same point in its band", () => {
      expect(placedHue("wastewater")).toBe(placedHue("wastewater"));
      expect(placedHue("wastewater")).toBe(
        placedHue("WasteWater".toLowerCase()),
      );
    });

    it("no two curated families' bands overlap", () => {
      for (let i = 0; i < CURATED_BANDS.length; i++) {
        for (let j = i + 1; j < CURATED_BANDS.length; j++) {
          const a = CURATED_BANDS[i];
          const b = CURATED_BANDS[j];
          expect(hueDistance(a.centre, b.centre)).toBeGreaterThanOrEqual(
            a.spread + b.spread,
          );
        }
      }
    });
  });

  describe("Tier 2: hashHue reserved-band avoidance", () => {
    it("never lands within a curated family's whole band", () => {
      // Sweep a wide sample of synthetic names; none should resolve within
      // any curated family's band (centre +/- effective spread).
      for (let i = 0; i < 200; i++) {
        const hue = hashHue(`synthetic-resource-${i}`);
        for (const band of CURATED_BANDS) {
          const distance = hueDistance(hue, band.centre);
          expect(distance).toBeGreaterThanOrEqual(band.spread);
        }
      }
    });

    it("is deterministic", () => {
      expect(hashHue("krunchies")).toBe(hashHue("krunchies"));
    });
  });

  it("two unknowns that both escape the same reserved band get distinct hues", () => {
    // solidfuel hashes to ~214deg (water's band) and kerbalkrunchies to ~128deg
    // (food's band), so both must escape. With a NAME-DERIVED escape step they
    // diverge instead of converging on one hue (the old fixed-step collision
    // put both on the same magenta ~1.7deg apart).
    expect(
      hueDistance(hashHue("solidfuel"), hashHue("kerbalkrunchies")),
    ).toBeGreaterThan(15);
  });
});
