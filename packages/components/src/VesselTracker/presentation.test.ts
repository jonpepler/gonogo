import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ContactPhase } from "@ksp-gonogo/sitrep-client";
import { Situation, VesselType } from "@ksp-gonogo/sitrep-sdk";
import { describe, expect, it } from "vitest";
import {
  DEADLINE_KIND_COLOUR,
  DEADLINE_KIND_LABEL,
  PHASE_LABEL,
  PHASE_SEVERITY,
  SITUATION_LABEL,
  VESSEL_TYPE_LABEL,
} from "./presentation";

const PHASES: ContactPhase[] = [
  "nominal",
  "waiting",
  "expected",
  "overdue",
  "lost",
];

describe("VesselTracker presentation", () => {
  /**
   * `var(--nope)` paints nothing at all: no warning, no error, an invisible
   * mark on a dark panel that a screenshot diff will not necessarily catch.
   * SystemView's markers were bitten by exactly this twice, so every token this
   * widget paints with is checked against the sheet.
   */
  describe("colour tokens", () => {
    const tokens = readFileSync(
      join(__dirname, "../../../theme/src/tokens.css"),
      "utf8",
    );
    const declared = new Set(
      Array.from(tokens.matchAll(/(--[a-z0-9-]+)\s*:/g), (m) => m[1]),
    );

    it("reads the token sheet", () => {
      expect(declared.size).toBeGreaterThan(20);
      expect(declared.has("--color-accent-fg")).toBe(true);
    });

    it.each(
      Object.entries(DEADLINE_KIND_COLOUR),
    )("%s uses a token that exists", (_kind, colour) => {
      const name = /var\((--[a-z0-9-]+)\)/.exec(colour)?.[1];
      expect(name, `${colour} is not a var() reference`).toBeDefined();
      expect(declared.has(name as string)).toBe(true);
    });

    it("gives each deadline kind its own colour, so the axis markers are tellable apart", () => {
      const used = Object.values(DEADLINE_KIND_COLOUR);
      expect(new Set(used).size).toBe(used.length);
    });

    it("colours the kinds off the categorical ramp, never the status palette", () => {
      // Hue here means WHICH DEADLINE, not how bad things are. Reaching for a
      // status token would make the geometric row look like a verdict about
      // the craft, which is the one thing this widget must not do.
      for (const colour of Object.values(DEADLINE_KIND_COLOUR)) {
        expect(colour).toMatch(/var\(--color-data-\d+\)/);
      }
    });
  });

  describe("contact phase vocabulary", () => {
    it("labels every phase the roster and SystemView can report", () => {
      for (const phase of PHASES) {
        expect(PHASE_LABEL[phase]).toBeTruthy();
        expect(PHASE_SEVERITY[phase]).toBeTruthy();
      }
    });

    it("keeps the vocabulary SystemView already uses, one meaning per word", () => {
      expect(PHASE_LABEL.lost).toBe("Officially lost");
      expect(PHASE_LABEL.waiting).toBe("No contact");
      expect(PHASE_LABEL.overdue).toBe("Overdue");
    });

    it("does not escalate a late craft to the severity of a lost one", () => {
      // There is still time for an overdue craft, and saying otherwise makes a
      // call the operator has not been given the chance to make.
      expect(PHASE_SEVERITY.overdue).toBe("warning");
      expect(PHASE_SEVERITY.lost).toBe("critical");
      expect(PHASE_SEVERITY.expected).toBe("info");
      expect(PHASE_SEVERITY.nominal).toBe("nominal");
    });

    it("labels every wire enum member, so none can render as undefined", () => {
      // A missing member is invisible: React renders `undefined` as nothing at
      // all, so the Type row would just be blank for that craft.
      for (const value of Object.values(VesselType)) {
        if (typeof value !== "number") continue;
        expect(VESSEL_TYPE_LABEL[value as VesselType]).toBeTruthy();
      }
      for (const value of Object.values(Situation)) {
        if (typeof value !== "number") continue;
        expect(SITUATION_LABEL[value as Situation]).toBeTruthy();
      }
    });

    it("never advises: no phase label recommends an action or renders a verdict", () => {
      const banned =
        /\b(trouble|abort|recommend|should|urgent|danger|act now|immediately|check|investigate)\b/i;
      for (const phase of PHASES) {
        expect(PHASE_LABEL[phase]).not.toMatch(banned);
      }
      for (const label of Object.values(DEADLINE_KIND_LABEL)) {
        expect(label).not.toMatch(banned);
      }
    });
  });
});
