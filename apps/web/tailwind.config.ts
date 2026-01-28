import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx,css}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f0f0f",
        muted: "#3f3932",
        bg: "#f6f1ea",
        surface: "#ffffff",
        "surface-alt": "#efe8dd",
        border: "#e2d6c6",
        accent: "#b16a3a",
        "accent-dark": "#7f3b1d",
        success: "#2f7a4d",
        danger: "#b54839"
      },
      fontFamily: {
        sans: ["'Noto Sans JP'", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "var(--shadow-soft)"
      }
    }
  },
  plugins: []
} satisfies Config;
