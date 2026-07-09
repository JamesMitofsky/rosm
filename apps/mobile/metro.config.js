// Expo's default Metro config auto-detects the pnpm monorepo (workspace root +
// node_modules resolution). withNativeWind wires the Tailwind CSS pipeline.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
