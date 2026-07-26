# @rosm/mobile

The Expo (React Native, SDK 57) app — the native surface for iOS/Android. It owns
auth, GPS/background tracking, and the map; all route/GPS/OSM logic comes from
[`@rosm/core`](../../packages/core). File-based routing via `expo-router` (`src/app/`),
styling via Uniwind (Tailwind 4), maps via MapLibre.

> **Status:** this app is wired and type-checked but has not yet been run on a device
> or simulator. Expect to iterate on the UI and confirm the MapLibre map + background
> location behavior on a first dev build. It is **not** runnable in Expo Go — MapLibre,
> background location, and SecureStore are native modules that need a **dev build**.

## Run it (dev build)

From the repo root, after `pnpm install`:

```bash
# Build + install the dev client on a booted iOS simulator, then start Metro:
pnpm --filter @rosm/mobile ios:simulator:dev-server
# Android:
pnpm --filter @rosm/mobile android:simulator:dev-server

# Metro only (once a dev build is installed):
pnpm --filter @rosm/mobile dev-server
```

`ios:simulator:dev-server` / `android:simulator:dev-server` run `expo run:*`, which prebuilds the native project and compiles the
dev client. For a physical device, use an [EAS](https://docs.expo.dev/build/introduction/)
`development` build (below).

## Environment

Create `apps/mobile/.env.local` (Expo inlines `EXPO_PUBLIC_*` at build time):

```
# Backend the app talks to. Simulator + local web dev: http://localhost:3000.
# Physical device: your machine's LAN IP (http://192.168.x.x:3000) or the Vercel URL.
EXPO_PUBLIC_API_BASE=http://localhost:3000

# Optional: override the map tiles (never bulk-download against tile.openstreetmap.org).
# EXPO_PUBLIC_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
```

OSM sign-in reuses the web backend's `/api/osm/auth?native=1` flow and returns the token
via the `rosm://osm-callback` deep link — so the backend at `EXPO_PUBLIC_API_BASE` must be
reachable, and its OSM app must allow the `localhost:3000/api/osm/callback` redirect (the
`rosm://` hop is internal).

## Config

`app.config.ts` pulls the app id / scheme / colors from
[`packages/core/appConfig.json`](../../packages/core/appConfig.json) — the single identity
source shared with the web PWA. Background-location entitlements and permission strings are
declared there too.

## Build & submit (EAS)

One-time: `eas init` (fills `extra.eas.projectId` in `app.config.ts`), then set the Apple
Team / App Store Connect IDs in [`eas.json`](./eas.json) and the `EXPO_PUBLIC_API_BASE`
per profile.

```bash
eas build --profile development --platform ios   # dev client for a device
eas build --profile production --platform ios
eas submit --profile production --platform ios
```

App Privacy: location (when-in-use + background, "app functionality", not linked to
identity, no tracking); local notifications only.
