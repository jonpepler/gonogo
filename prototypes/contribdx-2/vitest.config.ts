import { defineConfig } from "vitest/config";

// Standalone: outside the pnpm workspace and outside `vitest.workspace.ts`,
// so `pnpm test` never sees it. Run it with `./verify.sh`.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", include: ["src/**/*.test.tsx"] },
});
