# Contributing

## Before you start

- Open an issue describing the bug or change before writing code for anything non-trivial,
  so the approach can be agreed on first.
- One logical change per pull request. Keep unrelated refactors out of the diff.
- All write-back testing goes through the OSM **sandbox** (`master.apis.dev.openstreetmap.org`),
  never the live API. Do not commit edits that hit production OSM.

## Local setup

```bash
pnpm install
cp apps/site/.env.example apps/site/.env.local   # add your sandbox OSM OAuth client (see the file)
pnpm dev                                         # the site on http://localhost:4321
```

For the mobile app, see [apps/mobile/README.md](apps/mobile/README.md).

Node 24+ and pnpm 11 are required (pnpm is pinned via `packageManager`; run
`corepack enable`). Use pnpm — do not add a `package-lock.json` or `yarn.lock`.

## Code style

Formatting and lint style are enforced, not a matter of taste — everyone ships the same style.

- **Prettier** (`.prettierrc.json`) owns all formatting. Config: 2-space indent, double quotes,
  semicolons, trailing commas, 100-col width, LF endings. Tailwind classes are auto-sorted by
  `prettier-plugin-tailwindcss`.
- **ESLint** owns code correctness, with one flat config per package
  (`packages/core/eslint.config.mjs`, `apps/site/eslint.config.mjs`,
  `apps/mobile/eslint.config.js`); `pnpm lint` runs them all. Formatting is left to Prettier.
- **`.editorconfig`** sets editor defaults so files are consistent before Prettier even runs.
- A **husky** `pre-commit` hook runs **lint-staged**, which auto-fixes and formats staged files
  with each package's own config. Do not bypass it with `--no-verify`.
- A `pre-push` hook re-runs the CI Quality checks (`format:check`, `lint`, `typecheck`, `test`)
  before anything leaves your machine.

Do not hand-tune formatting or add per-file overrides; change the shared config in a dedicated
PR if the style itself needs to change.

### Wording users see

Volunteers don't know what OpenStreetMap or Overpass are, so text they see doesn't name them, or
use their jargon (nodes, tags, changesets). Say "the map", "the map data service" or "the
underlying data" instead. There are two exceptions. The map attribution must credit
OpenStreetMap under its licence. And the sign-in screen names it once, because sign-in opens
openstreetmap.org. Code, comments, logs and route names can say OSM freely.

## Tests

Tests run on [Vitest](https://vitest.dev), in two packages:

- `packages/core/tests/` — the shared logic: geo math, route planning, BRouter turn
  extraction, OSM tag transforms, schemas, and the run / planner / outbox stores and route
  archive, which run against in-memory fake ports (`tests/helpers/ports.ts`).
- `apps/site/tests/` — the site: `lib/` for its libs (the OSM, Overpass and upstream
  clients, the API client, map tap and failure handling, route progress, the demo/replay
  runs, the social card), `api/` for the `/api` route handlers (including the OAuth flow and
  the OSM write statuses), and `scripts/` for the build scripts.

```bash
pnpm test                                # both suites, through Turborepo
pnpm --filter @water-run/core test:watch      # watch mode for core
pnpm --filter @water-run/core test:coverage   # v8 coverage for core (text + html)
pnpm --filter @water-run/site test            # the site suite on its own
```

The mobile app has no test runner: put logic worth testing in `@water-run/core` (or another pure
module) and test it there.

Conventions:

- Suites run in the node environment; there is no DOM.
- All network I/O is mocked — the suites must pass offline and never touch the
  real OSM/Overpass/BRouter APIs.
- New features need tests in the matching package; bug fixes need a test that
  fails before the fix.

## Before opening a PR

```bash
pnpm format        # apply Prettier to the whole tree
pnpm lint          # eslint, must pass with no errors (pnpm lint:fix to auto-fix)
pnpm typecheck     # tsc --noEmit (astro check for the site), must pass
pnpm test          # vitest, must pass
pnpm build         # astro build for the site, must succeed
```

`pnpm format:check` is the CI-equivalent read-only check (it covers git-tracked files only).

### CI / deployment gate

`.github/workflows/ci.yml` runs Prettier, ESLint, the typechecks and the Vitest suites
(**Quality**) and a production `astro build` (**Build**) on every PR into `develop` or `main`
and on every push to `main`. Production deploys only from that workflow: on a push to `main`
its `deploy` job builds and deploys with the Vercel CLI after Quality and Build pass, and
Vercel's own Git deploys are disabled (`apps/site/vercel.json`). Keep the **Quality** and
**Build** checks required (GitHub → Settings → Branches → protect `main`) so a green suite
stays the precondition for anything reaching production.

To preview a PR, a maintainer comments `/deploy` on it. Previews are built only for branches
of this repo: a fork's code would run during the build with the deploy token in reach.

- TypeScript strict mode is on; do not introduce `any` or `@ts-ignore` to silence errors.

## Reading OSM data (Overpass)

Point searches (`/api/fountains`) read from the public Overpass servers, which are often over
capacity, give each IP only a couple of query slots, and see our functions arrive from cloud
addresses shared with other projects. So searches go through a shared cache
(`apps/site/src/lib/pointCache.ts`, on Vercel's Runtime Cache):

- Answers are kept for a week per 0.1° cell and point type. A search whose cells all have a copy
  is answered from them at once, whatever state Overpass is in. Copies over an hour old are then
  refreshed in the background with a single Overpass query, and the reply says `stale: true`.
- Only a search touching a cell that has never been fetched waits for Overpass, and fails if
  Overpass does.
- Our own OSM writes are laid over the cache for a day, so a volunteer's edit shows on their next
  search even while Overpass lags behind OSM.
- Failover tries each mirror in turn. One that hung or was unreachable goes to the back of the
  line for a minute. Setting `OVERPASS_URL` (for example a paid or self-hosted instance) puts it
  first.

This is also how Overpass's operators ask clients to behave: don't repeat identical queries.
OpenStreetMap's tile usage policy (no bulk downloading) is about `tile.openstreetmap.org`,
which we don't use.

## Commit and PR conventions

- Conventional Commits for messages: `feat(scope): …`, `fix(scope): …`, `chore: …`.
  See `git log` for existing scopes (`site`, `mobile`, `core`, `fountains`, `map`, `run`, …).
- Feature PRs target `develop`; `develop` is merged into `main` to release.
- PR description: what changed, why, and how it was tested. Note whether write-back was
  verified against the sandbox.
- Rebase on the target branch before requesting review; keep history linear.

## Scope of contributions

Useful areas: new OSM tag presets, additional lifecycle mappings, routing-profile options,
geolocation/compass accuracy on the mobile app's run screen, and offline behavior (the edit
outbox). Changes that write to OSM must preserve the single-changeset-per-run guarantee and
the lifecycle tag convention documented in the README.
