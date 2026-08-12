import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Design-system guard: no banner comment line (a `//` line made only of
 * repeated dashes, equals signs, or box-drawing characters) anywhere in
 * ui-kit src. A real multi-line explanation belongs in a `/** *\/` doc
 * block or paragraph; a banner adds decoration, not information, and
 * invites stacking prose into `//` fragments instead of a proper comment.
 */

const BANNER_RE = /^\s*\/\/\s*[-=─═]{3,}\s*$/;
const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__generated__") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...tsFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("design-system: no banner comments", () => {
  it("contains no triple-dash/equals/box-drawing comment banners", () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SRC_ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BANNER_RE.test(line)) {
          offenders.push(`${file.slice(SRC_ROOT.length + 1)}:${i + 1}`);
        }
      });
    }
    if (offenders.length > 0) {
      const sample = offenders.map((o) => `  ${o}`).join("\n");
      throw new Error(
        `Found ${offenders.length} banner comment line(s) in ui-kit src. Replace ` +
          "with a proper doc block or a single descriptive line. Offenders:\n" +
          sample,
      );
    }
    expect(offenders).toHaveLength(0);
  });
});
