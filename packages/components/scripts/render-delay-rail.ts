#!/usr/bin/env tsx
/**
 * Render the Panel delay rail (`Panel.Delay`) at a set of hand-built handle
 * scenarios to PNGs under `local_docs/renders/delay-ux-v3/`. Exists because the
 * dashboard visual-gate probe does not mount `DelayRailProvider`, so the rail
 * is invisible in CI; this driver + `delay-rail-probe/` close that gap. Model
 * copied from `render-alarm-banner.ts` (same esbuild -> injected HTML ->
 * playwright screenshot pipeline).
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE_DIR = resolve(HERE, "delay-rail-probe");
const PROBE_ENTRY = join(PROBE_DIR, "delay-rail-probe-entry.tsx");
const PROBE_HTML_TEMPLATE = join(PROBE_DIR, "delay-rail-probe.html");
const OUT_DIR = resolve(HERE, "../../../local_docs/renders/delay-ux-v3");
const THEME_TOKENS_CSS = resolve(HERE, "../../theme/src/tokens.css");

const VIEWPORT_W = 380;
const VIEWPORT_H = 360;

// Hand-built CommandDelayHandle scenarios. Plain data (no spine), the same
// shape `useCommand(...)` returns, so the rail draws exactly as it would for a
// real in-flight command.
const SCENARIOS: ReadonlyArray<{
  name: string;
  panelTitle: string;
  handle: unknown;
}> = [
  {
    name: "01-resting-empty-queue",
    panelTitle: "NAVBALL",
    // Delay set but nothing in flight: the rail renders null (no motion when
    // the queue is empty). This is the resting baseline.
    handle: { inFlight: [], shape: "discrete", effectiveDelaySeconds: 6 },
  },
  {
    name: "02-discrete-single-in-flight",
    panelTitle: "TARGET",
    handle: {
      inFlight: [
        {
          id: "c0",
          label: "Set target",
          command: "vessel.target.set",
          reachEtaSeconds: 6,
          replyEtaSeconds: 12,
          predictedPhase: "in-transit",
        },
      ],
      shape: "discrete",
      effectiveDelaySeconds: 6,
    },
  },
  {
    name: "04-continuous-stream-in-flight",
    panelTitle: "NAVBALL",
    // A fly-by-wire axis in flight: exercises the v3 ControlDelayStream at the
    // 16px rail size (variant="rail"), subtle 0.10 -> 0.40 confidence ramp, no
    // area fill. Two axes on one graph, one diverging in the confirmed zone.
    handle: {
      inFlight: [],
      shape: "stream",
      effectiveDelaySeconds: 1.6,
      streams: [
        {
          id: "vessel.control.throttle",
          label: "Throttle",
          oneWaySeconds: 1.6,
          inTransit: [
            { age: 0, value: 0.5 },
            { age: 2.4, value: 0.62 },
            { age: 4.8, value: 0.62 },
          ],
          echo: [
            { age: 3.2, value: 0.6 },
            { age: 4.0, value: 0.6 },
          ],
          current: 0.5,
        },
        {
          id: "vessel.control.pitch",
          label: "Pitch",
          oneWaySeconds: 1.6,
          inTransit: [
            { age: 0, value: 0.4 },
            { age: 2.4, value: 0.45 },
            { age: 4.8, value: 0.45 },
          ],
          echo: [
            { age: 3.2, value: 0.45 },
            { age: 4.0, value: 0.72 },
          ],
          current: 0.4,
        },
      ],
    },
  },
  {
    name: "03-discrete-multiple-in-flight",
    panelTitle: "NAVBALL",
    // Two handles worth of commands: shows the current rail's per-handle
    // stacking (each renders its own InFlightList box, not one merged list).
    handle: {
      inFlight: [
        {
          id: "c1",
          label: "SAS Prograde",
          command: "vessel.control.setSasMode",
          reachEtaSeconds: 3,
          replyEtaSeconds: 6,
          predictedPhase: "in-transit",
        },
        {
          id: "c2",
          label: "RCS on",
          command: "vessel.control.setRcs",
          reachEtaSeconds: 1,
          replyEtaSeconds: 5,
          predictedPhase: "awaiting-reply",
        },
      ],
      shape: "discrete",
      effectiveDelaySeconds: 3,
    },
  },
];

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  await cleanArtifacts(OUT_DIR);

  console.log("Bundling delay-rail-probe-entry with esbuild…");
  const bundleResult = await build({
    entryPoints: [PROBE_ENTRY],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    jsx: "automatic",
    write: false,
    sourcemap: "inline",
    define: { "process.env.NODE_ENV": '"production"' },
    loader: { ".css": "text" },
  });
  const bundleJs = bundleResult.outputFiles[0].text;

  const htmlTemplate = await readFile(PROBE_HTML_TEMPLATE, "utf8");
  const themeCss = extractRootBlock(await readFile(THEME_TOKENS_CSS, "utf8"));
  const escapedBundle = bundleJs.replace(/<\/script/gi, "<\\/script");
  const htmlWithBundle = htmlTemplate
    .replace(
      '<style id="probe-theme">/* injected by render-delay-rail driver from packages/theme/src/tokens.css */</style>',
      () => `<style id="probe-theme">${themeCss}</style>`,
    )
    .replace(
      '<script type="module" src="./delay-rail-probe-entry.bundle.js"></script>',
      () => `<script type="module">${escapedBundle}</script>`,
    );

  const probeHtmlOut = join(
    tmpdir(),
    `gonogo-delay-rail-probe-${process.pid}.html`,
  );
  await writeFile(probeHtmlOut, htmlWithBundle, "utf8");

  console.log("Launching Chromium…");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    page.on("pageerror", (err) => console.error("  [page error]", err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error")
        console.error("  [console error]", msg.text());
    });
    await page.goto(pathToFileURL(probeHtmlOut).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __renderDelayRail?: unknown })
          .__renderDelayRail === "function",
      undefined,
      { timeout: 10_000 },
    );

    for (const scenario of SCENARIOS) {
      await page.evaluate(
        (payload) =>
          (
            window as unknown as {
              __renderDelayRail: (p: unknown) => Promise<void>;
            }
          ).__renderDelayRail(payload),
        {
          handle: scenario.handle,
          panelTitle: scenario.panelTitle,
          pxW: VIEWPORT_W,
          pxH: VIEWPORT_H,
        },
      );
      const outName = `${scenario.name}.png`;
      await page.screenshot({ path: join(OUT_DIR, outName), fullPage: false });
      console.log(`  ${outName}`);

      // Where a rail exists, also click it to pin the detail float open and
      // capture that (the collapsed strip alone does not show the v3 float).
      const railBtn = await page.$("[data-panel-rail]");
      if (railBtn) {
        await railBtn.click();
        await page.waitForTimeout(200);
        const pinnedName = `${scenario.name}-pinned.png`;
        await page.screenshot({
          path: join(OUT_DIR, pinnedName),
          fullPage: false,
        });
        console.log(`  ${pinnedName}`);
      }
    }
    console.log(`\nRendered ${SCENARIOS.length} delay-rail shots → ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

function extractRootBlock(css: string): string {
  const m = css.match(/:root\s*\{[\s\S]*?\}/);
  if (!m) throw new Error("tokens.css: no :root block found");
  return m[0];
}

async function cleanArtifacts(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  let removed = 0;
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith(".png")) continue;
    await rm(join(dir, e.name));
    removed++;
  }
  if (removed > 0) console.log(`Cleaned ${removed} stale PNG(s) from ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
