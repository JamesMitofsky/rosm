// Static-export build for the Capacitor (iOS) target.
//
// `output: 'export'` cannot compile dynamic route handlers, and ours use
// cookies()/req/live fetch — so we temporarily move `app/api` out of the tree,
// run the export, then restore it. The restore is in `finally` so a failed build
// can never leave the repo without its API routes.
//
// Usage: pnpm build:capacitor

import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const API_DIR = resolve(ROOT, "app/api");
const STASH_DIR = resolve(ROOT, ".api-stash");

// A leftover stash from a previously-crashed run would shadow the real routes —
// restore it before doing anything else.
if (existsSync(STASH_DIR) && !existsSync(API_DIR)) {
  renameSync(STASH_DIR, API_DIR);
  console.log("↩︎  recovered app/api from a previous interrupted build");
}

const stashed = existsSync(API_DIR);
if (stashed) renameSync(API_DIR, STASH_DIR);

try {
  execSync("next build", {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, BUILD_TARGET: "capacitor" },
  });
} finally {
  if (stashed) renameSync(STASH_DIR, API_DIR);
}
