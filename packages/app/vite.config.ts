import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

// GitHub Pages has no server-side routing: a direct hit on /gonogo/station
// returns 404 because no station/index.html exists. Pages falls back to
// 404.html, so ship a byte-for-byte copy of index.html under that name and
// the SPA boots for every route.
const spaFallback = (): PluginOption => ({
  name: "gonogo-spa-fallback",
  apply: "build",
  closeBundle() {
    const outDir = resolve(__dirname, "dist");
    copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "404.html"));
  },
});

export default defineConfig({
  plugins: [react(), spaFallback()],
  base: process.env.VITE_BASE_PATH ?? "/",
});
