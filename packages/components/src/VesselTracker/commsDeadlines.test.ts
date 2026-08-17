import type { FleetVesselSilence } from "@ksp-gonogo/sitrep-client";
import { describe, expect, it } from "vitest";
import { commsDeadlineEntries } from "./commsDeadlines";

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

const of = (silence: FleetVesselSilence, kind: "geometric" | "declaration") =>
  commsDeadlineEntries("v1", silence).find((e) => e.kind === kind);

describe("commsDeadlineEntries", () => {
  it("contributes both comms-owned kinds, stamped with the craft they are about", () => {
    const entries = commsDeadlineEntries("v1", silent());
    expect(entries.map((e) => e.kind)).toEqual(["geometric", "declaration"]);
    expect(entries.every((e) => e.target === "v1")).toBe(true);
  });

  it("contributes nothing about the operational limit, which is not its to model", () => {
    expect(
      commsDeadlineEntries("v1", silent()).some(
        (e) => e.kind === "operational",
      ),
    ).toBe(false);
  });

  describe("geometric: when the radio path reopens", () => {
    it("reads the predicted reacquisition and names it as the basis", () => {
      const row = of(silent(), "geometric");
      expect(row?.atUt).toBe(1600);
      expect(row?.basis).toBe("predicted");
    });

    it("says how much slack the prediction was given, when it was given any", () => {
      // The spec's confidence section: "back at 14:32" and "back at 14:32, and
      // we would not call it late for another six minutes" are different
      // operational statements, and only the second one is checkable.
      const row = of(silent({ predictionGraceSeconds: 322 }), "geometric");
      expect(row?.basis).toBe("predicted");
      expect(row?.slackSeconds).toBe(322);
    });

    it("keeps the budget out of the basis, so the two facts do not share a line", () => {
      // The basis says how the UT was derived; the budget says how sure it is.
      // Composing them into one string is what pushed both off the row.
      const row = of(silent({ predictionGraceSeconds: 322 }), "geometric");
      expect(row?.basis).not.toMatch(/slack|\d/);
    });

    it("carries no budget when the producer published none", () => {
      const row = of(silent({ predictionGraceSeconds: null }), "geometric");
      expect(row?.basis).toBe("predicted");
      expect(row?.slackSeconds).toBeUndefined();
    });

    it("carries no budget beside a withheld prediction", () => {
      // An error bar around nothing reads as more certainty than the
      // withholding was meant to convey.
      const row = of(
        silent({ predictedReacquisitionUt: null, predictionGraceSeconds: 322 }),
        "geometric",
      );
      expect(row?.slackSeconds).toBeUndefined();
    });

    it("reports a withheld prediction as absent, never as a reacquisition now", () => {
      const row = of(silent({ predictedReacquisitionUt: null }), "geometric");
      expect(row?.atUt).toBeNull();
      expect(row?.basis).toBe("no prediction published");
    });

    it("carries the deadline basis through when it explains why no prediction exists", () => {
      const row = of(
        silent({
          predictedReacquisitionUt: null,
          deadlineBasis: "no-emergence-in-window",
        }),
        "geometric",
      );
      expect(row?.basis).toBe("no emergence found");
      expect(row?.detail).toBe("no emergence found in the search window");
    });

    it("still contributes a row while the craft is in contact, saying so", () => {
      // Contributing nothing would leave the host unable to tell "comms has no
      // opinion" from "comms is not installed", and those render differently.
      const row = of({ state: "Nominal" }, "geometric");
      expect(row?.atUt).toBeNull();
      expect(row?.basis).toBe("in contact");
    });
  });

  describe("declaration: when the game stops counting it as in contact", () => {
    it("reads the tracker deadline and names its basis in words", () => {
      const row = of(
        silent({ deadlineBasis: "orbital-period" }),
        "declaration",
      );
      expect(row?.atUt).toBe(2000);
      expect(row?.basis).toBe("orbit period");
      expect(row?.detail).toBe("orbital-period fallback");
    });

    it("does not reuse the geometric row's word for the same wire basis", () => {
      // `predicted-reacquisition` means the prediction itself on one row and
      // "graced off that prediction" on the other. One word for both loses the
      // distinction the spec names as the one an operator must never guess at.
      const entries = commsDeadlineEntries("v1", silent());
      const geometric = entries.find((e) => e.kind === "geometric");
      const declaration = entries.find((e) => e.kind === "declaration");
      expect(geometric?.basis).not.toBe(declaration?.basis);
      expect(declaration?.basis).toBe("prediction + grace");
    });

    it("distinguishes a deadline derived from the prediction from one that is a fallback", () => {
      const derived = of(silent(), "declaration")?.basis;
      const fallback = of(
        silent({ deadlineBasis: "orbital-period" }),
        "declaration",
      )?.basis;
      expect(derived).not.toBe(fallback);
    });

    it("keeps reporting the deadline once the craft is declared lost", () => {
      const row = of(
        { state: "Lost", deadlineUt: 2000, deadlineBasis: "policy-ceiling" },
        "declaration",
      );
      expect(row?.atUt).toBe(2000);
      expect(row?.basis).toBe("ceiling");
    });

    it("renders an unnamed basis as unstated rather than inventing one", () => {
      const row = of(silent({ deadlineBasis: null }), "declaration");
      expect(row?.atUt).toBe(2000);
      expect(row?.basis).toBe("basis not stated");
    });

    it("says there is no deadline rather than implying one at zero", () => {
      const row = of(
        silent({ deadlineUt: null, deadlineBasis: "no-occultation" }),
        "declaration",
      );
      expect(row?.atUt).toBeNull();
      expect(row?.basis).toBe("no deadline set");
    });
  });

  it("never advises: no verdict wording reaches any entry", () => {
    const banned =
      /\b(critical|urgent|danger|trouble|abort|recommend|should|warning|act now|immediately)\b/i;
    const cases: FleetVesselSilence[] = [
      { state: "Nominal" },
      silent(),
      silent({ predictedReacquisitionUt: null }),
      { state: "Lost", deadlineUt: 1, deadlineBasis: "destroyed" },
    ];
    for (const silence of cases) {
      for (const entry of commsDeadlineEntries("v1", silence)) {
        expect(entry.label).not.toMatch(banned);
        expect(entry.basis).not.toMatch(banned);
      }
    }
  });
});
