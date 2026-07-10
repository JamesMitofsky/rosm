// Fetch OSM points from the Overpass API.
import type { Fountain } from "./schemas";
import type { TagFilter, RecencyMode } from "./schemas";
import { matchesRecency } from "./checkDate";

export { parseCheckDate, matchesRecency } from "./checkDate";

// Cutoff epoch ms for "N months ago" from now.
function monthsAgo(months: number): number {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.getTime();
}

// Public Overpass mirrors, all serving identical ODbL OSM data. Tried in order;
// when the primary is overloaded (504/429) we fall through to the next. An env
// override is prepended so a self-hosted instance takes priority.
const OVERPASS_ENDPOINTS = [
  process.env.OVERPASS_URL,
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
].filter((u): u is string => !!u);

// Per-request client timeout. Slightly above the [timeout:25] server hint so a
// hung socket doesn't wait forever, but the server gets its full budget first.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS_PER_ENDPOINT = 2;

// Error thrown when every Overpass endpoint/attempt is exhausted. Carries a
// short, already-cleaned message (never raw HTML) plus a retryable hint so the
// API route and UI can offer a sensible recovery path.
export class OverpassError extends Error {
  status: number | null;
  retryable: boolean;
  constructor(message: string, status: number | null, retryable: boolean) {
    super(message);
    this.name = "OverpassError";
    this.status = status;
    this.retryable = retryable;
  }
}

// Turn an Overpass error body (often a full XHTML doc) into a short human line.
function cleanErrorBody(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 429 || lower.includes("too many requests")) {
    return "OpenStreetMap's data server is rate limiting requests. Please wait a moment and try again.";
  }
  if (lower.includes("too busy") || lower.includes("timeout") || status === 504) {
    return "OpenStreetMap's data server is busy right now. Please try again in a moment.";
  }
  return `OpenStreetMap's data server returned an error (${status}). Please try again shortly.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fetch an Overpass query with a client timeout, per-endpoint retries, and
// fallback across mirrors. Returns the parsed JSON; throws OverpassError when
// all options are exhausted.
async function fetchOverpass(query: string): Promise<{ elements: OverpassEl[] }> {
  let lastError: OverpassError | null = null;

  for (const url of OVERPASS_ENDPOINTS) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_ENDPOINT; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "run-for-maps/1.0 (OSM survey tool)",
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: controller.signal,
        });
        if (res.ok) {
          return (await res.json()) as { elements: OverpassEl[] };
        }
        // 429 and 5xx are transient server-side conditions — retry/fall through.
        const retryable = res.status === 429 || res.status >= 500;
        lastError = new OverpassError(
          cleanErrorBody(res.status, await res.text()),
          res.status,
          retryable,
        );
        if (!retryable) throw lastError;
      } catch (e) {
        if (e instanceof OverpassError) {
          if (!e.retryable) throw e; // non-retryable status: surface immediately
        } else {
          // Abort (timeout) or network error — treat as retryable.
          const aborted = (e as Error).name === "AbortError";
          lastError = new OverpassError(
            aborted
              ? "OpenStreetMap's data server took too long to respond. Please try again."
              : "Couldn't reach OpenStreetMap's data server. Check your connection and try again.",
            null,
            true,
          );
        }
      } finally {
        clearTimeout(timer);
      }
      // Short exponential backoff before the next attempt on this endpoint.
      await sleep(500 * (attempt + 1));
    }
  }

  throw lastError ?? new OverpassError("Couldn't reach OpenStreetMap's data server.", null, true);
}

type OverpassEl = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

// The area a search covers: either a circle (`around` an anchor) or the exact
// viewport rectangle (`bounds`). A rectangle query returns only points inside
// the drawn box — a circle circumscribing the viewport would spill past its
// edges — so viewport ("Search this area") searches use bounds, while anchored
// GPS/pin searches stay circular.
export type SearchRegion =
  { lat: number; lon: number; radiusM: number } | { bounds: [number, number, number, number] }; // [south, west, north, east]

// Overpass area filter for a region: `(around:r,lat,lon)` or a `(s,w,n,e)` bbox.
function areaFilter(region: SearchRegion): string {
  if ("bounds" in region) {
    const [s, w, n, e] = region.bounds;
    return `(${s},${w},${n},${e})`;
  }
  return `(around:${Math.round(region.radiusM)},${region.lat},${region.lon})`;
}

// Build a query for nodes/ways/relations matching key=value within a region.
// With `includeDisused`, also match the OSM lifecycle-prefixed variants
// (disused:key / abandoned:key) so out-of-service points come back too; the
// prefix is preserved in each element's tags for client-side classification.
export function buildQuery(region: SearchRegion, tag: TagFilter, includeDisused = false): string {
  const area = areaFilter(region);
  const prefixes = includeDisused ? ["", "disused:", "abandoned:"] : [""];
  const stmts = prefixes
    .flatMap((prefix) => {
      const sel = `["${prefix}${tag.key}"="${tag.value}"]`;
      return [`node${sel}${area};`, `way${sel}${area};`, `relation${sel}${area};`];
    })
    .map((s) => `  ${s}`)
    .join("\n");
  return `[out:json][timeout:25];
(
${stmts}
);
out center tags;`;
}

export async function fetchFountains(
  region: SearchRegion,
  tag: TagFilter,
  recencyMode: RecencyMode = "any",
  recencyMonths = 6,
  includeDisused = false,
): Promise<Fountain[]> {
  const query = buildQuery(region, tag, includeDisused);
  const cutoffMs = monthsAgo(recencyMonths);
  const json = await fetchOverpass(query);
  return json.elements
    .map((el): Fountain | null => {
      const lt = el.lat ?? el.center?.lat;
      const ln = el.lon ?? el.center?.lon;
      if (lt == null || ln == null) return null;
      return { id: el.id, lat: lt, lon: ln, tags: el.tags ?? {} };
    })
    .filter((f): f is Fountain => f !== null)
    .filter((f) => matchesRecency(f.tags, recencyMode, cutoffMs));
}
