// Stamps public/sw.js with a per-build cache version so every deploy ships a
// byte-different service worker. Browsers only install a new SW when /sw.js
// bytes change; a hardcoded VERSION meant the SW (and its stale HTML/chunk
// caches) never updated, leaving old clients pointed at pruned _next chunks
// → intermittent ChunkLoadError ("This page couldn't load") in production.
//
// Runs as `prebuild` (before `next build`). On Vercel the checkout is fresh
// each deploy, so the in-place rewrite is never committed. Locally, the source
// keeps its `rosm-v1` placeholder — `git checkout public/sw.js` after a build.
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = join(root, "public", "sw.js");

// Prefer Vercel's commit SHA; fall back to local git; last resort epoch minute.
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { cwd: root }).toString().trim();
    } catch {
      return `t${Math.floor(Date.now() / 60000)}`;
    }
  })();

const src = readFileSync(swPath, "utf8");
// Replace the VERSION constant value regardless of its current content, so the
// rewrite is idempotent across repeated builds.
const next = src.replace(/const VERSION = "rosm-[^"]*";/, `const VERSION = "rosm-${buildId}";`);

if (next === src) {
  console.warn("[stamp-sw] VERSION line not found — sw.js left unchanged.");
} else {
  writeFileSync(swPath, next);
  console.log(`[stamp-sw] service worker cache version → rosm-${buildId}`);
}
