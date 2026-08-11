import { defineConfig } from "vitest/config";

// Standalone: this prototype is deliberately outside the pnpm workspace and
// outside `vitest.workspace.ts`, so `pnpm test` never sees it. Run it with
// `./verify.sh`.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
