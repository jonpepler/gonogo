import { describe, expect, it } from "vitest";
import { textBuffer168 } from "./textBuffer168";

const LINE_WIDTH = 21;
const LINE_COUNT = 8;
const BLANK = " ".repeat(LINE_WIDTH);

describe("text-buffer-168 render style", () => {
  it("returns 8 lines of 21 characters separated by newlines", () => {
    const out = textBuffer168.render({});
    expect(typeof out).toBe("string");
    const lines = (out as string).split("\n");
    expect(lines).toHaveLength(LINE_COUNT);
    for (const line of lines) expect(line).toHaveLength(LINE_WIDTH);
  });

  it("renders each entry as KEY VALUE padded to 21 chars", () => {
    const out = textBuffer168.render({ ALT: 12_345 }) as string;
    const lines = out.split("\n");
    expect(lines[0]).toBe("ALT 12345".padEnd(LINE_WIDTH, " "));
    for (let i = 1; i < LINE_COUNT; i++) expect(lines[i]).toBe(BLANK);
  });

  it("formats booleans as ON/OFF", () => {
    const out = textBuffer168.render({ SAS: true, RCS: false }) as string;
    const lines = out.split("\n");
    expect(lines[0]).toBe(padTo("RCS OFF"));
    expect(lines[1]).toBe(padTo("SAS ON"));
  });

  it("rounds non-integer numbers to 2 decimal places", () => {
    const out = textBuffer168.render({ q: 0.1234 }) as string;
    expect(out.split("\n")[0]).toBe(padTo("q 0.12"));
  });

  it("sorts entries by key for determinism", () => {
    const out1 = textBuffer168.render({ b: 1, a: 2 }) as string;
    const out2 = textBuffer168.render({ a: 2, b: 1 }) as string;
    expect(out1).toBe(out2);
    expect(out1.split("\n")[0]).toBe(padTo("a 2"));
  });

  it("drops entries beyond the 8th", () => {
    const merged: Record<string, number> = {};
    for (let i = 0; i < 12; i++) merged[`k${String(i).padStart(2, "0")}`] = i;
    const lines = (textBuffer168.render(merged) as string).split("\n");
    expect(lines).toHaveLength(LINE_COUNT);
    // Last visible row should be k07 (8th in sorted order), not k11.
    expect(lines[7]).toBe(padTo("k07 7"));
  });

  it("truncates long lines to 21 chars", () => {
    const out = textBuffer168.render({
      LONG_KEY_NAME_FOR_TESTING: 42,
    }) as string;
    const first = out.split("\n")[0];
    expect(first).toHaveLength(LINE_WIDTH);
    expect(first.startsWith("LONG_KEY_NAME_FOR_TES")).toBe(true);
  });
});

function padTo(s: string): string {
  return s.padEnd(LINE_WIDTH, " ");
}
