import type { ExpoConfig } from "expo/config";

// Shared identity from @rosm/core. A relative require (not a package import) keeps
// the Expo config loader happy across the pnpm workspace symlink.
const rosm = require("../../packages/core/appConfig.json");

const config: ExpoConfig = {
  name: rosm.appName,
  slug: "rosm",
  version: "1.0.0",
  scheme: rosm.scheme, // registers rosm:// for the OSM OAuth deep-link callback
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: rosm.appId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // Background location so a run keeps tracking with the screen locked.
      UIBackgroundModes: ["location"],
      NSLocationWhenInUseUsageDescription:
        "ROSM shows your position on the map and guides you to each survey point.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "During an active run ROSM keeps recording your route and guiding you even when the screen is locked. Location is never collected outside an active run.",
    },
  },
  android: {
    package: rosm.appId,
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION", "ACCESS_BACKGROUND_LOCATION"],
  },
  plugins: [
    "expo-router",
    "@maplibre/maplibre-react-native",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "ROSM shows your position on the map and guides you to each survey point.",
        locationAlwaysAndWhenInUsePermission:
          "During an active run ROSM keeps recording your route and guiding you even when the screen is locked.",
        isAndroidBackgroundLocationEnabled: true,
      },
    ],
    "expo-notifications",
    "expo-secure-store",
    "expo-sqlite",
    "expo-sharing",
    [
      "expo-splash-screen",
      {
        backgroundColor: rosm.nativeBackground,
        image: "./assets/splash-icon.png",
        imageWidth: 180,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Set by `eas init`.
    eas: { projectId: "00000000-0000-0000-0000-000000000000" },
  },
};

export default config;
