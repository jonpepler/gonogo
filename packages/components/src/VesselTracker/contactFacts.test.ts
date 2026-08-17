import { describe, expect, it } from "vitest";
import { contactFacts } from "./contactFacts";

/**
 * The observed half of the contact section: when we last heard the craft and
 * how long it has been quiet. Facts only, no reckoning, that is
 * `trackerDeadlines`' half.
 *
 * The cases worth having are all absences. "Never heard from" and "heard from
 * 0 s ago" are completely different statements and a null read as a zero says
 * the second one while meaning the first.
 */
describe("contactFacts", () => {
  const nowUt = 5000;

  it("reports time since last contact against the view clock", () => {
    const facts = contactFacts(
      { connected: false, lastContactUt: 4400 },
      undefined,
      nowUt,
    );
    expect(facts.lastContactUt).toBe(4400);
    expect(facts.sinceLastContact).toBe(600);
  });

  it("carries connection state through as observed", () => {
    expect(
      contactFacts({ connected: true, lastContactUt: 5000 }, undefined, nowUt)
        .connected,
    ).toBe(true);
  });

  it("reports a vessel never heard from as unknown, not as heard from now", () => {
    const facts = contactFacts(
      { connected: false, lastContactUt: null },
      undefined,
      nowUt,
    );
    expect(facts.lastContactUt).toBeNull();
    expect(facts.sinceLastContact).toBeNull();
  });

  it("reports an absent contact topic as unknown throughout", () => {
    const facts = contactFacts(undefined, undefined, nowUt);
    expect(facts.connected).toBeNull();
    expect(facts.lastContactUt).toBeNull();
    expect(facts.sinceLastContact).toBeNull();
    expect(facts.silenceElapsed).toBeNull();
  });

  it("never reports a negative elapsed time when the view clock trails the wire", () => {
    // The view clock is delayed by design, so a contact stamped ahead of it is
    // ordinary, not a fault. "-3 s ago" is not a thing an operator should read.
    const facts = contactFacts(
      { connected: true, lastContactUt: 5003 },
      undefined,
      nowUt,
    );
    expect(facts.sinceLastContact).toBe(0);
  });

  it("measures the current silence run from where the tracker started it", () => {
    const facts = contactFacts(
      { connected: false, lastContactUt: 4000 },
      { state: "Silent", silenceSinceUt: 4200 },
      nowUt,
    );
    expect(facts.silenceElapsed).toBe(800);
  });

  it("has no silence run to measure while the vessel is in contact", () => {
    const facts = contactFacts(
      { connected: true, lastContactUt: 5000 },
      { state: "Nominal", silenceSinceUt: null },
      nowUt,
    );
    expect(facts.silenceElapsed).toBeNull();
  });

  it("keeps measuring the silence run after the vessel is declared lost", () => {
    // Declaring it lost does not stop the clock; how long it has been gone is
    // still a fact, and the widget goes on reporting it.
    const facts = contactFacts(
      { connected: false, lastContactUt: 1000 },
      { state: "Lost", silenceSinceUt: 1200 },
      nowUt,
    );
    expect(facts.silenceElapsed).toBe(3800);
  });

  it("does not substitute the last-contact time for a missing silence start", () => {
    // They are different instants: contact can be lost some way before the
    // tracker opens a silence run, and quietly conflating them would report a
    // silence longer than the one the tracker is actually reckoning against.
    const facts = contactFacts(
      { connected: false, lastContactUt: 1000 },
      { state: "Silent", silenceSinceUt: null },
      nowUt,
    );
    expect(facts.silenceElapsed).toBeNull();
  });
});
