import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@kototsute/shared": resolve(__dirname, "../../packages/shared/src"),
      "@kototsute/asset": resolve(__dirname, "../../packages/asset/src")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true
  }
});
