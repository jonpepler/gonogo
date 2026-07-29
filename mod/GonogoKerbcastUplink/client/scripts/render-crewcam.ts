#!/usr/bin/env tsx
/**
 * THROWAWAY manual-review renderer: CrewManifest with the kerbcast crew
 * face-camera avatar slot filled, for a one-off operator screenshot. Not
 * part of `render-widget`/`widgets.ts`/the visual gate: see
 * `crewcam-probe/crewcam-probe-entry.tsx`'s doc comment for why this needed
 * its own tiny bundle rather than reusing the shared harness.
 *
 * Run: `pnpm --filter @ksp-gonogo/gonogo-kerbcast-uplink exec tsx scripts/render-crewcam.ts <outDir>`
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type Plugin } from "esbuild";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE_DIR = resolve(HERE, "crewcam-probe");
const PROBE_ENTRY = join(PROBE_DIR, "crewcam-probe-entry.tsx");
const PROBE_HTML_TEMPLATE = join(PROBE_DIR, "crewcam-probe.html");
const GLOBAL_CSS = resolve(
  HERE,
  "../../../../packages/app/src/styles/global.css",
);

const COL_WIDTH = 32;
const ROW_HEIGHT = 25;
const GRID_MARGIN = 8;

// Same CrewManifest grid modes widgets.ts declares for the real (gate-free)
// review renders: defaultSize 6x8 plus a roomier wide mode so the two live
// avatars + badges are easy to read.
const MODES = [
  { name: "default-6x8", w: 6, h: 8 },
  { name: "wide-9x10", w: 9, h: 10 },
];

// Mirrors widgetRenderHarness.ts's own CSS-side-effect plugin: any bare
// `.css` import (ui-kit / ui components) becomes a `<style>`-appending JS
// module instead of an inert string esbuild would otherwise tree-shake away.
const cssSideEffectPlugin: Plugin = {
  name: "css-side-effect",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\.css$/ }, (args) => {
      const resolvedPath = require.resolve(args.path, {
        paths: [args.resolveDir],
      });
      return { path: resolvedPath, sideEffects: true };
    });
    pluginBuild.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await readFile(args.path, "utf8");
      return {
        loader: "js",
        contents: `const __style = document.createElement("style");
__style.textContent = ${JSON.stringify(css)};
document.head.appendChild(__style);`,
      };
    });
  },
};

function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{[\s\S]*?\}/);
  if (!match) throw new Error("global.css: no :root block found");
  return match[0];
}

async function jetbrainsMonoFontFace(): Promise<string> {
  const regular = require.resolve(
    "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
  );
  const bold = require.resolve(
    "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2",
  );
  const b64 = async (p: string) => (await readFile(p)).toString("base64");
  return `
    @font-face{font-family:"JetBrains Mono";font-weight:400;font-style:normal;
      src:url(data:font/woff2;base64,${await b64(regular)}) format("woff2");}
    @font-face{font-family:"JetBrains Mono";font-weight:700;font-style:normal;
      src:url(data:font/woff2;base64,${await b64(bold)}) format("woff2");}
  `;
}

async function prepareProbePage(): Promise<string> {
  console.log("Bundling crewcam-probe-entry with esbuild...");
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
    plugins: [cssSideEffectPlugin],
  });
  const bundleJs = bundleResult.outputFiles[0].text;

  const htmlTemplate = await readFile(PROBE_HTML_TEMPLATE, "utf8");
  const themeCss = extractRootBlock(await readFile(GLOBAL_CSS, "utf8"));
  const fontFace = await jetbrainsMonoFontFace();
  const escapedBundle = bundleJs.replace(/<\/script/gi, "<\\/script");
  const htmlWithBundle = htmlTemplate
    .replace(
      /<style id="probe-theme">[\s\S]*?<\/style>/,
      () => `<style id="probe-theme">${fontFace}${themeCss}</style>`,
    )
    .replace(
      '<script type="module" src="./crewcam-probe-entry.bundle.js"></script>',
      () => `<script type="module">${escapedBundle}</script>`,
    );

  const probeHtmlOut = join(
    tmpdir(),
    `gonogo-crewcam-probe-${process.pid}.html`,
  );
  await writeFile(probeHtmlOut, htmlWithBundle, "utf8");
  return probeHtmlOut;
}

async function main(): Promise<void> {
  const outDir = resolve(
    process.argv[2] ??
      resolve(HERE, "../../../../local_docs/renders/crewcam-review"),
  );
  await mkdir(outDir, { recursive: true });

  const probeHtmlOut = await prepareProbePage();

  console.log("Launching chromium...");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 900, height: 900 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      console.error("  [page error]", err.message);
      pageErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error")
        console.error("  [console error]", msg.text());
    });

    await page.goto(pathToFileURL(probeHtmlOut).toString(), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __renderCrewcam?: unknown })
          .__renderCrewcam === "function",
      undefined,
      { timeout: 10_000 },
    );

    for (const mode of MODES) {
      const pxW = mode.w * COL_WIDTH + (mode.w - 1) * GRID_MARGIN;
      const pxH = mode.h * ROW_HEIGHT + (mode.h - 1) * GRID_MARGIN;
      await page.evaluate(
        (p) =>
          (
            window as unknown as {
              __renderCrewcam: (payload: unknown) => Promise<void>;
            }
          ).__renderCrewcam(p),
        { w: mode.w, h: mode.h, pxW, pxH },
      );
      const root = await page.$("#root");
      if (!root) throw new Error("crewcam probe: #root missing after render");
      const outPath = join(
        outDir,
        `crew-manifest-kerbcast-avatar--${mode.name}.png`,
      );
      await root.screenshot({ path: outPath, animations: "disabled" });
      console.log(`  rendered -> ${outPath}`);
    }

    if (pageErrors.length > 0) {
      const unique = [...new Set(pageErrors)];
      throw new Error(
        `crewcam render raised ${pageErrors.length} uncaught error(s):\n  ${unique.join("\n  ")}`,
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
