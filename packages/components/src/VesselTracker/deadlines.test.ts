import { describe, expect, it } from "vitest";
import {
  type DeadlineKind,
  trackerDeadlines,
  type VesselTrackerDeadlineEntry,
} from "./deadlines";

/**
 * The widget's central constraint: three deadlines that are all durations and
 * all mean different things. A test suite that only checked "a countdown
 * renders" would pass just as happily on the merged version, so these assert
 * the separation itself: three rows, always in the same order, each naming its
 * own basis, and an absent one saying so rather than leaving two rows looking
 * like the complete set.
 */

const entry = (
  kind: DeadlineKind,
  over: Partial<VesselTrackerDeadlineEntry> = {},
): VesselTrackerDeadlineEntry => ({
  target: "v1",
  kind,
  label: kind,
  atUt: 1000,
  basis: "test basis",
  ...over,
});

describe("trackerDeadlines", () => {
  it("always returns exactly the three kinds, in geometric/operational/declaration order", () => {
    const rows = trackerDeadlines([entry("declaration"), entry("geometric")]);
    expect(rows.map((r) => r.kind)).toEqual([
      "geometric",
      "operational",
      "declaration",
    ]);
  });

  it("keeps the three kinds distinct even when they fall at the same UT", () => {
    // The merge failure this widget exists to avoid: identical numbers must
    // still read as three separate statements about three different things.
    const rows = trackerDeadlines([
      entry("geometric", { atUt: 5000, label: "Radio path reopens" }),
      entry("operational", { atUt: 5000, label: "Life support" }),
      entry("declaration", { atUt: 5000, label: "Counted as lost" }),
    ]);
    expect(rows.map((r) => r.atUt)).toEqual([5000, 5000, 5000]);
    expect(new Set(rows.map((r) => r.label)).size).toBe(3);
    expect(new Set(rows.map((r) => r.question)).size).toBe(3);
    expect(new Set(rows.map((r) => r.owner)).size).toBe(3);
  });

  it("names an owner for every kind, so no row is anonymous", () => {
    const rows = trackerDeadlines([]);
    expect(rows.map((r) => r.owner)).toEqual([
      "comms",
      "life support",
      "silence tracker",
    ]);
  });

  it("frames every row itself, so a contributor supplies data and never chrome", () => {
    // The host owns the question and the owner; a contributor that tried to
    // supply them could make two rows read as the same statement.
    const rows = trackerDeadlines([
      entry("geometric", { label: "whatever the contributor called it" }),
    ]);
    expect(rows[0].label).toBe("whatever the contributor called it");
    expect(rows[0].question).toBe("when will we be able to hear it");
    expect(rows[0].owner).toBe("comms");
  });

  describe("when a kind was not contributed at all", () => {
    it("still renders the row, saying why it is empty", () => {
      // A comparison with a silently missing member misleads: the reader
      // assumes the set is complete and never learns a third kind exists.
      const rows = trackerDeadlines([entry("geometric"), entry("declaration")]);
      expect(rows[1].atUt).toBeNull();
      expect(rows[1].basis).toBe("not modelled");
      expect(rows[1].label).toBe("Operational limit");
    });

    it("reports both comms-owned rows as unmodelled in a stock game", () => {
      // No comms domain means the silence roster never delivers, so the
      // contribution has nothing to fan out over and contributes nothing.
      const rows = trackerDeadlines([]);
      expect(rows[0].basis).toBe("no silence model");
      expect(rows[2].basis).toBe("no silence model");
      expect(rows.every((r) => r.atUt === null)).toBe(true);
    });
  });

  describe("when several contributors speak to one kind", () => {
    it("shows the soonest limit and names which one it is", () => {
      const rows = trackerDeadlines([
        entry("operational", { label: "Power", atUt: 9000 }),
        entry("operational", { label: "Life support", atUt: 4000 }),
      ]);
      expect(rows[1].atUt).toBe(4000);
      expect(rows[1].label).toBe("Life support");
    });

    it("never lets an undated entry outrank a dated one", () => {
      // A contributor with nothing to say must not become the earliest limit.
      const rows = trackerDeadlines([
        entry("operational", { label: "Unknown", atUt: null }),
        entry("operational", { label: "Life support", atUt: 4000 }),
      ]);
      expect(rows[1].atUt).toBe(4000);
      expect(rows[1].label).toBe("Life support");
    });

    it("keeps an undated entry's words when it is all there is", () => {
      const rows = trackerDeadlines([
        entry("operational", {
          label: "Life support",
          atUt: null,
          basis: "sensor offline",
        }),
      ]);
      expect(rows[1].atUt).toBeNull();
      expect(rows[1].basis).toBe("sensor offline");
    });
  });

  it("never advises, in any row: no verdict wording reaches the model", () => {
    // The widget informs. Every string it produces itself is a fact or a named
    // basis, so a reviewer adding "critical"/"act now"/"in trouble" to the
    // host's own framing trips this rather than shipping.
    const banned =
      /\b(critical|urgent|danger|trouble|abort|recommend|should|warning|act now|immediately)\b/i;
    for (const row of trackerDeadlines([])) {
      expect(row.label).not.toMatch(banned);
      expect(row.basis).not.toMatch(banned);
      expect(row.question).not.toMatch(banned);
      expect(row.owner).not.toMatch(banned);
    }
  });
});
