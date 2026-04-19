import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "serial",
    environment: "jsdom",
    globals: true,
    exclude: ["dist/**", "node_modules/**"],
  },
});
