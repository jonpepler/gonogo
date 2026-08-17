import type { FleetVesselSilence } from "@ksp-gonogo/sitrep-client";
import { describe, expect, it } from "vitest";
import { trackerDeadlines, type VesselTrackerDeadlineEntry } from "./deadlines";

/**
 * The widget's central constraint: three deadlines that are all durations and
 * all mean different things. A test suite that only checked "a countdown
 * renders" would pass just as happily on the merged version, so these assert
 * the separation itself: three rows, always in the same order, each naming its
 * own basis, and an absent one saying so rather than leaving two rows looking
 * like the complete set.
 */

const silent = (
  over: Partial<FleetVesselSilence> = {},
): FleetVesselSilence => ({
  state: "Silent",
  silenceSinceUt: 1000,
  deadlineUt: 2000,
  deadlineBasis: "predicted-reacquisition",
  predictedReacquisitionUt: 1600,
  ...over,
});

const lifeSupport = (
  over: Partial<VesselTrackerDeadlineEntry> = {},
): VesselTrackerDeadlineEntry => ({
  target: "v1",
  label: "Life support",
  atUt: 5000,
  basis: "oxygen at current draw",
  ...over,
});

describe("trackerDeadlines", () => {
  it("always returns exactly the three kinds, in geometric/operational/declaration order", () => {
    const rows = trackerDeadlines(silent(), [lifeSupport()]);
    expect(rows.map((r) => r.kind)).toEqual([
      "geometric",
      "operational",
      "declaration",
    ]);
  });

  it("keeps the three kinds distinct even when they fall at the same UT", () => {
    // The merge failure this widget exists to avoid: identical numbers must
    // still read as three separate statements about three different things.
    const rows = trackerDeadlines(
      silent({ deadlineUt: 5000, predictedReacquisitionUt: 5000 }),
      [lifeSupport({ atUt: 5000 })],
    );
    expect(rows.map((r) => r.atUt)).toEqual([5000, 5000, 5000]);
    expect(new Set(rows.map((r) => r.label)).size).toBe(3);
    expect(new Set(rows.map((r) => r.owner)).size).toBe(3);
  });

  it("names an owner for every kind, so no row is anonymous", () => {
    const rows = trackerDeadlines(silent(), [lifeSupport()]);
    expect(rows.map((r) => r.owner)).toEqual([
      "comms",
      "life support",
      "silence tracker",
    ]);
  });

  describe("geometric: when the radio path reopens", () => {
    it("reads the predicted reacquisition and names it as the basis", () => {
      const [geometric] = trackerDeadlines(silent(), []);
      expect(geometric.atUt).toBe(1600);
      expect(geometric.basis).toBe("predicted reacquisition");
    });

    it("reports a withheld prediction as absent, never as a reacquisition now", () => {
      const [geometric] = trackerDeadlines(
        silent({ predictedReacquisitionUt: null }),
        [],
      );
      expect(geometric.atUt).toBeNull();
      expect(geometric.basis).toBe("no prediction published");
    });

    it("carries the deadline basis through when it explains why no prediction exists", () => {
      const [geometric] = trackerDeadlines(
        silent({
          predictedReacquisitionUt: null,
          deadlineBasis: "no-emergence-in-window",
        }),
        [],
      );
      expect(geometric.atUt).toBeNull();
      expect(geometric.basis).toBe("no emergence found in the search window");
    });

    it("has nothing to say while the vessel is in contact", () => {
      const [geometric] = trackerDeadlines(
        { state: "Nominal", predictedReacquisitionUt: null },
        [],
      );
      expect(geometric.atUt).toBeNull();
      expect(geometric.basis).toBe("in contact");
    });
  });

  describe("operational: how long it can survive", () => {
    it("is absent, and says so, when nothing models it", () => {
      const [, operational] = trackerDeadlines(silent(), []);
      expect(operational.atUt).toBeNull();
      expect(operational.basis).toBe("not modelled");
    });

    it("takes the earliest contributed limit and names which one it is", () => {
      const [, operational] = trackerDeadlines(silent(), [
        lifeSupport({ label: "Power", atUt: 9000, basis: "battery at load" }),
        lifeSupport({ label: "Life support", atUt: 4000 }),
      ]);
      expect(operational.atUt).toBe(4000);
      expect(operational.label).toBe("Life support");
      expect(operational.basis).toBe("oxygen at current draw");
    });

    it("ignores contributed entries with no UT rather than treating them as now", () => {
      const [, operational] = trackerDeadlines(silent(), [
        lifeSupport({ atUt: null }),
      ]);
      expect(operational.atUt).toBeNull();
    });
  });

  describe("declaration: when the game stops counting it as in contact", () => {
    it("reads the tracker deadline and names its basis in words", () => {
      const [, , declaration] = trackerDeadlines(
        silent({ deadlineBasis: "orbital-period" }),
        [],
      );
      expect(declaration.atUt).toBe(2000);
      expect(declaration.basis).toBe("orbital-period fallback");
    });

    it("distinguishes a deadline derived from the prediction from one that is a fallback", () => {
      const derived = trackerDeadlines(silent(), [])[2];
      const fallback = trackerDeadlines(
        silent({ deadlineBasis: "orbital-period" }),
        [],
      )[2];
      expect(derived.basis).not.toBe(fallback.basis);
    });

    it("has already passed once the vessel is declared lost", () => {
      const [, , declaration] = trackerDeadlines(
        { state: "Lost", deadlineUt: 2000, deadlineBasis: "policy-ceiling" },
        [],
      );
      expect(declaration.atUt).toBe(2000);
      expect(declaration.basis).toBe("policy ceiling");
    });

    it("has nothing to declare while the vessel is in contact", () => {
      const [, , declaration] = trackerDeadlines({ state: "Nominal" }, []);
      expect(declaration.atUt).toBeNull();
      expect(declaration.basis).toBe("in contact");
    });

    it("renders an unnamed basis as unstated rather than inventing one", () => {
      const [, , declaration] = trackerDeadlines(
        silent({ deadlineBasis: null }),
        [],
      );
      expect(declaration.atUt).toBe(2000);
      expect(declaration.basis).toBe("basis not stated");
    });
  });

  describe("with no silence reckoning at all (stock game)", () => {
    it("still returns three rows, with both comms-owned ones absent", () => {
      const rows = trackerDeadlines(undefined, []);
      expect(rows).toHaveLength(3);
      expect(rows[0].atUt).toBeNull();
      expect(rows[2].atUt).toBeNull();
      expect(rows[0].basis).toBe("no silence model");
      expect(rows[2].basis).toBe("no silence model");
    });

    it("still surfaces a contributed operational limit", () => {
      const [, operational] = trackerDeadlines(undefined, [lifeSupport()]);
      expect(operational.atUt).toBe(5000);
    });
  });

  it("never advises, in any row: no verdict wording reaches the model", () => {
    // The widget informs. Every string it can produce is a fact or a named
    // basis, so a reviewer adding "critical"/"act now"/"in trouble" to a basis
    // map trips this rather than shipping.
    const banned =
      /\b(critical|urgent|danger|trouble|abort|recommend|should|warning|act now|immediately)\b/i;
    const cases: Array<
      [FleetVesselSilence | undefined, VesselTrackerDeadlineEntry[]]
    > = [
      [undefined, []],
      [{ state: "Nominal" }, []],
      [silent(), [lifeSupport()]],
      [silent({ predictedReacquisitionUt: null }), []],
      [{ state: "Lost", deadlineUt: 1, deadlineBasis: "destroyed" }, []],
    ];
    for (const [silence, entries] of cases) {
      for (const row of trackerDeadlines(silence, entries)) {
        expect(row.label).not.toMatch(banned);
        expect(row.basis).not.toMatch(banned);
        expect(row.owner).not.toMatch(banned);
      }
    }
  });
});
