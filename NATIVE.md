# Fountain Mapper — iOS (Capacitor) build & deploy

One codebase, two outputs:

- **Web + API** — `next build`, deployed to Vercel. Serves the PWA **and** the
  `/api/*` backend (OSM OAuth, BRouter, Overpass, run state). Unchanged.
- **iOS** — a static export of the frontend (`out/`) bundled into a Capacitor app
  that calls the Vercel `/api/*` over HTTPS.

## Capacitor as the source of truth

Capacitor is the single point the rest derives from — on **both** targets:

- **Identity** — `lib/appConfig.ts` (id, name, scheme, colors) feeds both
  `capacitor.config.ts` (native) and `app/manifest.ts` (PWA). One place to edit.
- **Device APIs** — calls go through Capacitor plugins everywhere
  (`lib/geolocation.ts`, `haptics.ts`, `share.ts`, `OutboxSync` network). Their web
  implementations power the PWA (Geolocation/Vibration/Web Share/online events), the
  native implementations power iOS. No `navigator` vs native branching in app code.
- **Native-only features** stay guarded by `isNative()` because the web impl can't
  deliver the value: background GPS, Live Activity, status bar, splash, and the
  background proximity/sync notifications.

**The one exception — the service worker.** Capacitor has no service-worker
primitive; offline caching + installability is a web-platform concern. So `sw.js` +
the web manifest are the PWA's shell, owned by Next.js, and `ServiceWorkerRegister`
is skipped on native (the bundled assets are the shell there). Everything else
springs from Capacitor.

## Prerequisites

- Xcode 16+ and an iOS Simulator (or device + Apple Developer account for TestFlight).
- The backend deployed somewhere reachable (Vercel). The app needs its URL.

## Configure

Set the API the bundled app calls in **`.env.capacitor`** (gitignored):

```
NEXT_PUBLIC_API_BASE=https://<your-deployment>.vercel.app
```

Leave it empty for the web build (same-origin). `capacitor.config.ts` holds the
app id (`org.rosm.app`), URL scheme (`rosm`), and allowed hosts.

## Build & run

```
pnpm build:capacitor     # static export → out/ (app/api is stashed during export)
pnpm cap:sync            # build:capacitor + cap sync ios
pnpm ios                 # cap:sync + open Xcode
pnpm ios:run             # cap:sync + run on the booted simulator
```

The export build excludes `app/api` (route handlers can't be statically exported);
`scripts/build-capacitor.mjs` restores it afterward, even on failure.

## OSM sign-in (native)

`signInOsm()` opens the OAuth flow in an in-app browser at
`<API_BASE>/api/osm/auth?native=1`. The callback returns the token via the
`rosm://osm-callback` deep link; it's stored in the iOS keychain
(`@capacitor/preferences`) and sent as a `Bearer` header (`lib/osmToken.ts` reads
header-or-cookie). **Nothing extra to register with OSM** — OSM still redirects to
the Vercel `/api/osm/callback`; the `rosm://` hop is internal.

## Native integrations (wired)

- **Background GPS** — keeps tracking with the screen off (`@capacitor-community/background-geolocation`).
- **Geolocation / haptics / keep-awake / status bar / splash** — official Capacitor plugins.
- **Safe-area insets** — `.safe-top` / `.safe-bottom-3` / `.safe-pb` in `globals.css`.
- **Local notifications** — proximity-to-next-point, run-complete, sync-on-reconnect.
- **Network** — drives outbox re-sync after a reconnect.
- **Share** — iOS share sheet on the run-complete screen.
- **Live Activity + Dynamic Island** — JS wired; **needs a one-time Xcode Widget
  Extension target** → see [`ios/LiveActivity/SETUP.md`](ios/LiveActivity/SETUP.md).

## Store readiness (Phase 7 — needs Apple Developer account)

- Signing: open Xcode → App target → Signing & Capabilities → set Team. Add the
  **Background Modes (Location)** capability; it's already in `Info.plist`.
- Privacy usage strings (location/motion) are set in `Info.plist`. Fill the App
  Store **App Privacy** answers (location use; no tracking).
- App icon set + splash are generated under `ios/App/App/Assets.xcassets`
  (`@capacitor/assets` from `assets/`).
- Archive → distribute to **TestFlight** → submit for review.
