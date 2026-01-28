import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@kototsute/shared": resolve(__dirname, "../shared/src")
    }
  },
  test: {
    environment: "node"
  }
});
