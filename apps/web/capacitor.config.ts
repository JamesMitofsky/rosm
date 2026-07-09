import type { CapacitorConfig } from "@capacitor/cli";
import { APP_ID, APP_NAME, NATIVE_BACKGROUND } from "./lib/appConfig";

// Native shell config. The web assets are the static export in `out/` (built by
// `pnpm build:capacitor`); the app calls the Vercel-hosted `/api/*` over HTTPS.
// Identity (id/name/colors) comes from lib/appConfig — the single source the web
// manifest reads too.
const config: CapacitorConfig = {
  appId: APP_ID,
  appName: APP_NAME,
  webDir: "out",
  // Route fetch()/XHR through the native HTTP stack so calls to the remote API
  // aren't blocked by the webview's CORS policy (the app origin is capacitor://).
  plugins: {
    CapacitorHttp: { enabled: true },
  },
  ios: {
    // Match the dark theme so there's no white gap behind the webview.
    backgroundColor: NATIVE_BACKGROUND,
  },
  server: {
    // Hosts the webview may navigate to / load (map tiles, OSM, geocoder).
    allowNavigation: [
      "tile.openstreetmap.org",
      "*.tile.openstreetmap.org",
      "nominatim.openstreetmap.org",
      "www.openstreetmap.org",
      "api.openstreetmap.org",
      "master.apis.dev.openstreetmap.org",
      "overpass-api.de",
      "overpass.kumi.systems",
      "overpass.private.coffee",
      "brouter.de",
    ],
  },
};

export default config;
