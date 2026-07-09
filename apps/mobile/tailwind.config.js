const { colors } = require("../../packages/core/appConfig.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Shared ROSM palette (same tokens as the web app's @theme block), so
      // class names like bg-paper / text-ink-dim port 1:1 from the web UI.
      colors,
    },
  },
};
