import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@kototsute/shared": resolve(__dirname, "../../packages/shared/src")
    }
  },
  server: {
    port: 5175
  }
});
