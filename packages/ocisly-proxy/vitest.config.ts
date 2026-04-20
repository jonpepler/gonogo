import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ocisly-proxy",
    environment: "node",
    globals: true,
    exclude: ["dist/**", "node_modules/**"],
  },
});
