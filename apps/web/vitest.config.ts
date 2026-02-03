import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@kototsute/shared": resolve(__dirname, "../../packages/shared/src"),
      "@kototsute/asset": resolve(__dirname, "../../packages/asset/src"),
      "@kototsute/tasks": resolve(__dirname, "../../packages/tasks/src")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
    passWithNoTests: true
  }
});
