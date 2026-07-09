// OSM survey/check-date tag helpers. Client-safe (no server deps) so both the
// Overpass fetch path and browser-side filters can share the same logic.
import type { RecencyMode } from "./schemas";

// OSM tags surveyors use to record when a point was last verified on the ground.
export const CHECK_DATE_KEYS = ["check_date", "survey:date", "checked"];

// Parse an OSM date tag (YYYY, YYYY-MM, or YYYY-MM-DD) to a UTC epoch ms, or
// null if missing/unparseable. Partial dates resolve to their earliest instant.
export function parseCheckDate(raw?: string): number | null {
  if (!raw) return null;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(raw.trim());
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1);
  return Number.isNaN(t) ? null : t;
}

// Epoch ms of a point's most recent ground verification, or null if never recorded.
export function lastCheckedMs(tags: Record<string, string>): number | null {
  const raw = CHECK_DATE_KEYS.map((k) => tags[k]).find((v) => v != null);
  return parseCheckDate(raw);
}

// True if a point passes the recency filter. "stale" keeps points last surveyed
// before the cutoff OR never surveyed (the ones worth verifying); "fresh" keeps
// only points surveyed on/after the cutoff; "any" keeps everything.
export function matchesRecency(
  tags: Record<string, string>,
  mode: RecencyMode,
  cutoffMs: number,
): boolean {
  if (mode === "any") return true;
  const checked = lastCheckedMs(tags);
  if (mode === "stale") return checked === null || checked < cutoffMs;
  return checked !== null && checked >= cutoffMs;
}
