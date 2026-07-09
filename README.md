# ROSM — Fountain Run Planner

Plan a running route past OpenStreetMap points (drinking fountains by default), run it
on your phone with turn-toward-next-point guidance, and record each point's real-world
state back to OSM (`check_date`, `disused:`, `abandoned:`) as you go.

## How it works

1. **Find points** — fetches OSM features matching a tag (`amenity=drinking_water` default,
   any `key=value` supported) within a radius via the Overpass API.
2. **Plan route** — picks and orders a subset that fits a **target run distance** (so you can
   split the city across multiple runs), then draws a real walking/running route via the free
   BRouter API. Loop or one-way, your choice.
3. **Run** — mobile-first view: live distance + compass arrow to the next point. On arrival,
   mark it **Working** / **Out of order** / **Removed**, which writes the edit to OSM under one
   changeset for the run.

State mapping (OSM lifecycle convention):

| Action       | Effect on the node                                                |
| ------------ | ----------------------------------------------------------------- |
| Working      | set `check_date=<today>`                                          |
| Out of order | move `amenity=drinking_water` → `disused:amenity=...`, stamp date |
| Removed      | move → `abandoned:amenity=...`, stamp date                        |
| Delete (adv) | delete the node entirely                                          |

## Monorepo layout

A pnpm + [Turborepo](https://turbo.build) monorepo with two apps and shared logic:

```
apps/
  web/     @rosm/web    — Next.js 16 site + /api backend + PWA (deployed to Vercel)
  mobile/  @rosm/mobile — Expo (React Native) app for iOS/Android
packages/
  core/              @rosm/core — shared logic (GPS math, routing, Zod schemas,
                     Zustand stores, route archive) behind injected platform ports
  typescript-config/ shared tsconfig bases
```

`@rosm/core` holds everything platform-agnostic and reaches for no browser / native API
directly — each app injects its own adapters (storage, geolocation, network, …) via
`configureCore()`. That's how the same GPS/route/OSM logic runs on both surfaces.

## Prerequisites

- **Node 24+** and **pnpm 11** (pinned via `packageManager`; run `corepack enable`).
- For the mobile app: Xcode + an iOS Simulator (or an Android emulator), and an
  [Expo](https://expo.dev) account for device / TestFlight builds.

## Quick start

```bash
pnpm install            # once, at the repo root (never inside a package)

pnpm dev                # start the web app (http://localhost:3000)
pnpm --filter @rosm/mobile start   # start the mobile dev server
```

Workspace-wide tasks run through Turborepo (cached, only re-run what changed):

```bash
pnpm lint        # eslint across all packages
pnpm typecheck   # tsc --noEmit across all packages
pnpm test        # vitest (core + web)
pnpm build       # production builds
pnpm format      # prettier --write .
```

Target a single package with `pnpm --filter <name> <script>`, e.g.
`pnpm --filter @rosm/web test:watch`.

## Per-app setup

Each app has its own README with the details that matter locally:

- **[apps/web/README.md](apps/web/README.md)** — running the site, `.env.local`, and the
  OSM OAuth2 setup needed to write edits back.
- **[apps/mobile/README.md](apps/mobile/README.md)** — Expo dev builds, env vars, and EAS.

## External services

OSM Overpass, BRouter, Nominatim (geocoding), and OSM tiles — all public and rate-limited;
be gentle. No keys required except your OSM OAuth client ID (see the web README).

## Temporary Migration Docs

> Remove once the monorepo migration merges to `main`.

While `main` is still the pre-migration flat layout, feature-branch previews deploy to a
separate throwaway Vercel project (`rosm-monorepo-preview`, Root Directory `apps/web`) so the
production project stays untouched. Check its latest deploy status with:

```
vercel ls rosm-monorepo-preview
```

Top row is the latest; the Status column reads `● Ready`, `● Building`, or `● Error`.

## Contributing

Pull requests welcome — the project lives at
[github.com/JamesMitofsky/run-for-maps](https://github.com/JamesMitofsky/run-for-maps).
See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR conventions.

## Deploy setup (TODO)

Vercel git auto-deploy is disabled (`vercel.json`). Production deploys on a green
push to `main` via CI; previews are opt-in by commenting `/deploy` on a PR.
To activate, one-time:

- [ ] Add repo secrets: `VERCEL_TOKEN` ([create token](https://vercel.com/account/settings/tokens)),
      `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
      Get the IDs via `vercel link` → read `.vercel/project.json` (`orgId`, `projectId`).
      Do not commit `.vercel/`.
- [ ] Merge this config to `main` — `vercel.json` git settings only apply once on
      the production branch, and `/deploy` (an `issue_comment` workflow) only runs
      from the default branch.
- [ ] Enable branch protection on `main`: require the `Quality` and `Build` status
      checks to pass before merge.
