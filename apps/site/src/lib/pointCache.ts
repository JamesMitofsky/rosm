// Point searches answered from a shared cache of Overpass replies, kept per map
// cell, so volunteers get an answer straight away whenever an area has been
// searched in the last week, whatever state Overpass is in, and the public
// Overpass servers are asked about an area at most about once an hour however
// many people search it.
//
// Why: the public servers are often over capacity, they give each IP only a
// couple of query slots, and our functions leave from cloud addresses shared
// with everyone else's projects. A fresh query per search turned those limits
// into "took too long" for volunteers. Overpass's own guidance is to not repeat
// identical queries, so this is also the polite way to use it.
//
// How:
// - The world is cut into fixed 0.1° cells (about 8.6 x 11 km in DC). Each
//   point type has its own entry per cell, holding every match including the
//   disused: variant, so `includeDisused` is a filter here rather than a
//   separate entry. Entries are kept for a week.
// - A search reads every cell it covers. When each one has a copy, the search
//   is answered from them at once. Any copy over an hour old is then refreshed
//   in the background, for the next search, with one Overpass query for all
//   of them (never one per cell). The reply says `stale` when it used such a
//   copy.
// - Only a search touching a cell with no copy at all waits for Overpass, and
//   it fails if Overpass does: showing the other cells alone would look like
//   "no fountains here".
// - Writes this server makes to OSM go into a per-cell edit list for a day and
//   are laid over whatever the cache holds, since Overpass can lag behind OSM by
//   minutes, and by hours when overloaded. Without it a volunteer who verified
//   a fountain would see the old state on their next search.
//
// Storage is Vercel's Runtime Cache: regional, shared by every instance and
// kept across deployments, but free to evict at any time, so nothing here
// relies on an entry still being there. Off Vercel (dev) `getCache` falls back
// to an in-memory cache by itself.
import { getCache, waitUntil } from "@vercel/functions";
import type { Fountain, RecencyMode, TagFilter } from "@water-run/core/schemas";
import { matchesRecency } from "@water-run/core/checkDate";
import { haversine } from "@water-run/core/geo";
import {
  buildQuery,
  fetchOverpass,
  monthsAgo,
  OverpassError,
  type FetchOverpassOptions,
  type OverpassEl,
  type SearchRegion,
} from "./overpass";

const CELLS_PER_DEG = 10;
// How old a cell's copy can get before a search refreshes it in the
// background. A dev-only override makes that easy to try by hand.
const FRESH_MS = Number(process.env.POINT_CACHE_FRESH_MS) || 60 * 60 * 1000;
// How long a copy is kept to answer from, however long Overpass stays down.
const KEEP_S = 7 * 24 * 60 * 60;
// How long one of our own OSM writes is laid over the cache: long enough for
// Overpass to have caught up, however far behind it was.
const EDIT_KEEP_MS = 24 * 60 * 60 * 1000;
// Part of every key: bump it when an entry's shape changes, so old entries are
// never read as new ones.
const NAMESPACE = "points-v1";
// Metres per degree of latitude, rounded down so a circle's covering box
// errs larger, never smaller.
const M_PER_DEG = 111_000;

type Cell = { x: number; y: number };
type Rect = { minX: number; minY: number; maxX: number; maxY: number };
type Box = [south: number, west: number, north: number, east: number];

// An Overpass match as stored. `type` stays so an edit to node 5 never touches
// way 5.
type CachedPoint = {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
};
type CellEntry = { fetchedAt: number; points: CachedPoint[] };
// A node as one of our OSM writes left it; `tags: null` means deleted.
type PointWrite = { id: number; lat: number; lon: number; tags: Record<string, string> | null };
type PointEdit = PointWrite & { at: number };

// The slice of Vercel's RuntimeCache this module uses, so tests can hand in
// their own.
export interface CellStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number }): Promise<void>;
}

let store: CellStore | null = null;
function cellStore(): CellStore {
  return (store ??= getCache({ namespace: NAMESPACE }));
}

// Swap the store, or pass null to go back to the Runtime Cache. For tests.
export function useCellStore(s: CellStore | null): void {
  store = s;
}

// A plain in-memory store, for tests.
export function memoryCellStore(): CellStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => (data.has(key) ? structuredClone(data.get(key)) : null),
    set: async (key, value) => void data.set(key, structuredClone(value)),
  };
}

// The cache is an optimisation in front of Overpass. If it fails, we go to
// Overpass rather than fail the search.
async function read(key: string): Promise<unknown> {
  try {
    return await cellStore().get(key);
  } catch (e) {
    console.warn("[pointCache] read failed", key, e);
    return null;
  }
}

async function write(key: string, value: unknown, ttlS: number): Promise<void> {
  try {
    await cellStore().set(key, value, { ttl: ttlS });
  } catch (e) {
    // The likeliest cause is an entry over the store's item size limit (2 MB),
    // which only a very dense point type in a city centre could reach. Such a
    // cell just goes uncached.
    console.warn("[pointCache] write failed", key, e);
  }
}

const cellIndex = (deg: number) => Math.floor(deg * CELLS_PER_DEG);
const cellId = ({ x, y }: Cell) => `${x},${y}`;
const cellKey = (tag: TagFilter, c: Cell) => `cell|${tag.key}=${tag.value}|${cellId(c)}`;
const editsKey = (c: Cell) => `edits|${cellId(c)}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// The box a region covers: the rectangle itself, or a box just larger than the
// circle.
function regionBox(region: SearchRegion): Box {
  if ("bounds" in region) return region.bounds;
  const dLat = region.radiusM / M_PER_DEG;
  const dLon =
    region.radiusM / (M_PER_DEG * Math.max(Math.cos((region.lat * Math.PI) / 180), 0.01));
  return [
    clamp(region.lat - dLat, -90, 90),
    clamp(region.lon - dLon, -180, 180),
    clamp(region.lat + dLat, -90, 90),
    clamp(region.lon + dLon, -180, 180),
  ];
}

function coveringRect([s, w, n, e]: Box): Rect {
  return { minX: cellIndex(w), minY: cellIndex(s), maxX: cellIndex(e), maxY: cellIndex(n) };
}

function cellsIn({ minX, minY, maxX, maxY }: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) out.push({ x, y });
  return out;
}

function rectAround(cells: Cell[]): Rect {
  return {
    minX: Math.min(...cells.map((c) => c.x)),
    minY: Math.min(...cells.map((c) => c.y)),
    maxX: Math.max(...cells.map((c) => c.x)),
    maxY: Math.max(...cells.map((c) => c.y)),
  };
}

// A rectangle of cells as an Overpass bbox. Dividing whole numbers by ten gives
// the shortest decimal (-77.4, not -77.39999…), so the query text is stable.
function rectBox({ minX, minY, maxX, maxY }: Rect): Box {
  return [
    clamp(minY / CELLS_PER_DEG, -90, 90),
    clamp(minX / CELLS_PER_DEG, -180, 180),
    clamp((maxY + 1) / CELLS_PER_DEG, -90, 90),
    clamp((maxX + 1) / CELLS_PER_DEG, -180, 180),
  ];
}

function asEntry(v: unknown): CellEntry | null {
  if (!v || typeof v !== "object") return null;
  const e = v as Partial<CellEntry>;
  return typeof e.fetchedAt === "number" && Array.isArray(e.points) ? (e as CellEntry) : null;
}

function asEdits(v: unknown, now: number): PointEdit[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is PointEdit =>
      !!e &&
      typeof e === "object" &&
      typeof e.id === "number" &&
      typeof e.at === "number" &&
      now - e.at < EDIT_KEEP_MS,
  );
}

// One Overpass request at a time per query on this instance: volunteers who
// search the same area together share it. The request is cancelled only once
// every caller waiting on it has gone, so one leaving never fails the others.
type Flight = {
  promise: Promise<{ elements: OverpassEl[] }>;
  ctrl: AbortController;
  waiting: number;
};
const flights = new Map<string, Flight>();

function sharedFetch(
  query: string,
  { signal, ...options }: FetchOverpassOptions,
): Promise<{ elements: OverpassEl[] }> {
  signal?.throwIfAborted();
  let flight = flights.get(query);
  if (!flight) {
    const ctrl = new AbortController();
    const promise = fetchOverpass(query, { ...options, signal: ctrl.signal }).finally(() =>
      flights.delete(query),
    );
    flight = { promise, ctrl, waiting: 0 };
    flights.set(query, flight);
  }
  const f = flight;
  f.waiting++;
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      if (--f.waiting === 0) f.ctrl.abort(signal?.reason);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    f.promise.then(
      (v) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

// Fetch every cell in `rect` with one query and store each one, empty cells
// included: an empty cell is an answer too.
async function refresh(
  tag: TagFilter,
  rect: Rect,
  options: FetchOverpassOptions,
): Promise<Map<string, CellEntry>> {
  const json = await sharedFetch(buildQuery({ bounds: rectBox(rect) }, tag, true), options);
  const fetchedAt = Date.now();
  const byCell = new Map(cellsIn(rect).map((c) => [cellId(c), [] as CachedPoint[]]));
  for (const el of json.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    // A way that crosses into the box but is centred outside it belongs to a
    // cell this query didn't cover.
    byCell
      .get(cellId({ x: cellIndex(lon), y: cellIndex(lat) }))
      ?.push({ type: el.type, id: el.id, lat, lon, tags: el.tags ?? {} });
  }
  const entries = new Map<string, CellEntry>();
  const writes: Promise<void>[] = [];
  for (const c of cellsIn(rect)) {
    const entry = { fetchedAt, points: byCell.get(cellId(c)) ?? [] };
    entries.set(cellId(c), entry);
    writes.push(write(cellKey(tag, c), entry, KEEP_S));
  }
  // Awaited, so the writes land before the platform freezes the function.
  await Promise.all(writes);
  return entries;
}

// Refreshes started after a reply went out. Vercel's `waitUntil` keeps the
// function alive until each settles; off Vercel it does nothing and the
// promise just runs on.
const pending = new Set<Promise<void>>();
// When each background query was last tried. A failed one isn't tried again
// for a minute, so while Overpass is down every search doesn't add to its
// load. A successful one makes its cells fresh, so it isn't due again anyway.
const BACKGROUND_RETRY_MS = 60_000;
const lastTried = new Map<string, number>();

function refreshInBackground(tag: TagFilter, rect: Rect): void {
  const key = `${tag.key}=${tag.value}|${rect.minX},${rect.minY},${rect.maxX},${rect.maxY}`;
  const now = Date.now();
  if (now - (lastTried.get(key) ?? -Infinity) < BACKGROUND_RETRY_MS) return;
  for (const [k, at] of lastTried) if (now - at >= BACKGROUND_RETRY_MS) lastTried.delete(k);
  lastTried.set(key, now);

  // No caller signal: the search that started it has had its answer, and
  // the refresh is for whoever searches next.
  const p: Promise<void> = refresh(tag, rect, {})
    .then(
      () => {},
      (e: unknown) => {
        const message = e instanceof OverpassError ? e.message : String(e);
        console.warn("[pointCache] background refresh failed; older copies stay:", message);
      },
    )
    .finally(() => pending.delete(p));
  pending.add(p);
  waitUntil(p);
}

// Wait for every background refresh to finish. For tests.
export async function settleBackgroundRefreshes(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}

// Forget background retry timing. For tests, which share one module.
export function resetBackgroundRefreshes(): void {
  lastTried.clear();
}

// A cell's points with our own recent writes laid over them, oldest first so
// the latest write to a node wins.
function withEdits(points: CachedPoint[], edits: PointEdit[]): CachedPoint[] {
  if (edits.length === 0) return points;
  const byKey = new Map(points.map((p) => [`${p.type}/${p.id}`, p]));
  for (const e of [...edits].sort((a, b) => a.at - b.at)) {
    const key = `node/${e.id}`;
    if (e.tags) byKey.set(key, { type: "node", id: e.id, lat: e.lat, lon: e.lon, tags: e.tags });
    else byKey.delete(key);
  }
  return [...byKey.values()];
}

export type PointsOptions = FetchOverpassOptions & {
  includeDisused?: boolean;
  recencyMode?: RecencyMode;
  recencyMonths?: number;
};

export type PointsResult = {
  fountains: Fountain[];
  // Some of these came from a copy over an hour old (it is being refreshed,
  // or Overpass couldn't be reached last time it was tried).
  stale: boolean;
  // When the oldest copy used was fetched, epoch ms.
  asOf: number;
};

// Every point of `tag` in `region`: from the cache when every cell it covers
// has a copy, refreshing old ones in the background, otherwise from Overpass.
// Throws OverpassError only when some cell has no copy and Overpass fails, or
// the caller's abort reason when it cancels while waiting on Overpass.
export async function getPoints(
  region: SearchRegion,
  tag: TagFilter,
  {
    includeDisused = false,
    recencyMode = "any",
    recencyMonths = 6,
    ...options
  }: PointsOptions = {},
): Promise<PointsResult> {
  const box = regionBox(region);
  const cells = cellsIn(coveringRect(box));
  const now = Date.now();
  const [entries, edits] = await Promise.all([
    Promise.all(cells.map((c) => read(cellKey(tag, c)).then(asEntry))),
    Promise.all(cells.map((c) => read(editsKey(c)).then((v) => asEdits(v, now)))),
  ]);

  const isOld = (e: CellEntry) => now - e.fetchedAt >= FRESH_MS;
  const due = cells.filter((_, i) => {
    const e = entries[i];
    return !e || isOld(e);
  });
  if (entries.some((e) => !e)) {
    // Some cell has nothing to show yet, so this search waits for Overpass.
    // Its old cells ride along in the same query.
    const fresh = await refresh(tag, rectAround(due), options);
    cells.forEach((c, i) => {
      entries[i] = fresh.get(cellId(c)) ?? entries[i];
    });
  } else if (due.length > 0) {
    // Every cell has a copy: answer with it now and bring the old ones up to
    // date for the next search.
    refreshInBackground(tag, rectAround(due));
  }
  const stale = entries.some((e) => e && isOld(e));

  const [s, w, n, e] = box;
  const inRegion =
    "bounds" in region
      ? (p: CachedPoint) => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e
      : (p: CachedPoint) => haversine(region, p) <= region.radiusM;
  const matchesTag = (tags: Record<string, string>) =>
    tags[tag.key] === tag.value || (includeDisused && tags[`disused:${tag.key}`] === tag.value);
  const cutoffMs = monthsAgo(recencyMonths);

  const fountains: Fountain[] = [];
  let asOf = now;
  entries.forEach((entry, i) => {
    // Every entry is set by now: a missing one was fetched, or that threw.
    if (!entry) return;
    asOf = Math.min(asOf, entry.fetchedAt);
    for (const p of withEdits(entry.points, edits[i])) {
      if (!inRegion(p) || !matchesTag(p.tags) || !matchesRecency(p.tags, recencyMode, cutoffMs)) {
        continue;
      }
      fountains.push({ id: p.id, lat: p.lat, lon: p.lon, tags: p.tags });
    }
  });
  return { fountains, stale, asOf };
}

// Note a write this server just made to OSM, so searches show it before
// Overpass catches up. Never throws: the write already succeeded, and a missed
// note only means the old state shows until the next refresh.
//
// Two writes in one cell at the same moment can race and lose one note. That
// edit then shows its old state until Overpass has it, which is a stale view
// and nothing worse.
export async function recordPointWrite(w: PointWrite): Promise<void> {
  if (!Number.isFinite(w.id) || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) return;
  try {
    const key = editsKey({ x: cellIndex(w.lon), y: cellIndex(w.lat) });
    const now = Date.now();
    const kept = asEdits(await read(key), now).filter((e) => e.id !== w.id);
    await write(key, [...kept, { ...w, at: now }], EDIT_KEEP_MS / 1000);
  } catch (e) {
    console.warn("[pointCache] couldn't note an OSM write", w.id, e);
  }
}
