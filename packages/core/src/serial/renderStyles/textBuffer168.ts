import { registerSerialRenderStyle } from "../registry";
import type { DeviceRenderStyle } from "../types";

const LINE_WIDTH = 21;
const LINE_COUNT = 8;

function formatValue(value: unknown): string {
  if (value === true) return "ON";
  if (value === false) return "OFF";
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  return String(value);
}

function padLine(line: string): string {
  if (line.length > LINE_WIDTH) return line.slice(0, LINE_WIDTH);
  return line.padEnd(LINE_WIDTH, " ");
}

/**
 * 8 lines × 21 characters = 168 ASCII characters, joined by `\n` (no trailing
 * newline). Each entry in `merged` renders as one line formatted as
 * `KEY VALUE`; entries are sorted by key for deterministic output. Entries
 * beyond the 8th are dropped. Empty rows are all-space.
 */
export const textBuffer168: DeviceRenderStyle = {
  id: "text-buffer-168",
  name: "Text Buffer (21×8)",
  description: "Eight 21-character lines — the canonical small LCD panel.",
  render(merged) {
    const entries = Object.entries(merged)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, LINE_COUNT);

    const lines: string[] = [];
    for (const [key, value] of entries) {
      const formatted = formatValue(value);
      lines.push(padLine(formatted ? `${key} ${formatted}` : key));
    }
    while (lines.length < LINE_COUNT) {
      lines.push(" ".repeat(LINE_WIDTH));
    }
    return lines.join("\n");
  },
};

registerSerialRenderStyle(textBuffer168);
