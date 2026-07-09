// Contributor leaderboard, sourced from OSM itself (durable + real) rather than
// the ephemeral local edit log.
//
// Every changeset the app opens is tagged `created_by` = APP_NAME (see lib/osm).
// OSMCha exposes an `editor` filter over that tag, but the query is unindexed and
// times out (>90s) — unusable at request time. OSM's own changeset API can't
// filter by tag at all. So instead we:
//   1. DISCOVER app contributors by scanning recent changesets in the DC bbox and
//      keeping the ones tagged with an app editor (cheap: one page = 100).
//   2. TALLY each discovered (and previously-known) user's lifetime app edits via
//      the indexed per-user changeset query, summing `changes_count` = points.
//   3. CACHE the aggregate so page loads never wait on the OSM roundtrips.
import { readJson, writeJson } from "./db";
import { APP_NAME } from "./appConfig";

const OSM_BASE = process.env.OSM_API_BASE || "https://api.openstreetmap.org";
const UA = "run-for-maps/1.0 (leaderboard)";

// Editor tags that count as "edited through the app": the current brand name plus
// the historical repo slug, so pre-rename changesets still attribute correctly.
const APP_EDITORS = new Set([APP_NAME, "run-for-maps"]);

// Bounding box the app operates in (≈ the live fountain map's DC coverage), used
// only to discover which users have recently edited via the app.
const DC_BBOX = "-77.20,38.70,-76.85,39.05";

const CACHE_FILE = "leaderboard-cache.json";
const TTL_MS = 60 * 60 * 1000; // 1h
const MAX_ENTRIES = 10;
// A user with more changesets than this has older app edits we won't page back to.
// Fine for this project's scale; logged rather than silently dropped.
const PER_USER_PAGE = 100;

export type LeaderboardEntry = {
  username: string;
  uid: number;
  points: number; // sum of changes_count across the user's app changesets
  changesets: number;
};

type Cache = { generatedAt: string; entries: LeaderboardEntry[] };

type OsmChangeset = {
  uid?: number;
  user?: string;
  changes_count?: number;
  tags?: Record<string, string>;
};

async function fetchChangesets(query: string): Promise<OsmChangeset[]> {
  const res = await fetch(`${OSM_BASE}/api/0.6/changesets.json?${query}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`OSM changesets ${res.status}`);
  const j = (await res.json()) as { changesets?: OsmChangeset[] };
  return j.changesets ?? [];
}

const isAppEdit = (c: OsmChangeset) => APP_EDITORS.has(c.tags?.created_by ?? "");

// Recently-active app contributors, from a single bbox page. Newest-first, so
// this surfaces whoever has edited most recently — enough to keep the board warm.
async function discoverUsers(): Promise<Map<number, string>> {
  const changesets = await fetchChangesets(`bbox=${DC_BBOX}`);
  const users = new Map<number, string>();
  for (const c of changesets) {
    if (isAppEdit(c) && c.uid != null && c.user) users.set(c.uid, c.user);
  }
  return users;
}

// One user's lifetime app tally. Single page (newest 100 changesets) — covers
// every contributor at this project's scale; truncation past 100 is logged.
async function tallyUser(username: string): Promise<LeaderboardEntry | null> {
  const changesets = await fetchChangesets(`display_name=${encodeURIComponent(username)}`);
  if (changesets.length === PER_USER_PAGE) {
    console.warn(
      `[leaderboard] ${username} has ≥${PER_USER_PAGE} changesets; older ones untallied`,
    );
  }
  const app = changesets.filter(isAppEdit);
  if (app.length === 0) return null;
  return {
    username,
    uid: app[0].uid ?? 0,
    points: app.reduce((sum, c) => sum + (c.changes_count ?? 0), 0),
    changesets: app.length,
  };
}

function sortTop(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries]
    .sort((a, b) => b.points - a.points || a.username.localeCompare(b.username))
    .slice(0, MAX_ENTRIES);
}

// Rebuild the aggregate: known users (from the last cache) ∪ freshly-discovered
// ones, re-tallied against live OSM. Returns stale cache on total failure so a
// transient OSM outage never blanks the board.
async function rebuild(prev: Cache | null): Promise<LeaderboardEntry[]> {
  try {
    const discovered = await discoverUsers();
    const usernames = new Set<string>([
      ...discovered.values(),
      ...(prev?.entries.map((e) => e.username) ?? []),
    ]);
    const tallied = await Promise.all([...usernames].map((u) => tallyUser(u).catch(() => null)));
    return sortTop(tallied.filter((e): e is LeaderboardEntry => e !== null));
  } catch (e) {
    console.error("[leaderboard] rebuild failed:", e);
    return prev?.entries ?? [];
  }
}

// Cached top-N contributors. Rebuilds when the cache is missing or older than TTL;
// otherwise returns instantly. Timestamps come from the caller (no Date in render).
export async function getLeaderboard(nowMs: number): Promise<LeaderboardEntry[]> {
  const cache = await readJson<Cache | null>(CACHE_FILE, null);
  const fresh = cache && nowMs - new Date(cache.generatedAt).getTime() < TTL_MS;
  if (fresh) return cache.entries;

  const entries = await rebuild(cache);
  await writeJson<Cache>(CACHE_FILE, { generatedAt: new Date(nowMs).toISOString(), entries });
  return entries;
}

// Upsert a single signed-in user's tally into the cache without a full rebuild —
// guarantees a contributor appears the moment they load the app, even if their
// recent edits fell outside the discovery bbox page.
export async function registerUser(username: string): Promise<void> {
  const entry = await tallyUser(username);
  if (!entry) return;
  const cache = await readJson<Cache | null>(CACHE_FILE, null);
  const others = (cache?.entries ?? []).filter((e) => e.username !== username);
  const entries = sortTop([...others, entry]);
  await writeJson<Cache>(CACHE_FILE, {
    generatedAt: cache?.generatedAt ?? new Date().toISOString(),
    entries,
  });
}
