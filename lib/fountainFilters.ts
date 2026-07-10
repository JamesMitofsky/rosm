import type { Fountain } from "@/lib/schemas";
import { haversine, type Pt } from "@/lib/geo";

// Pure classification + ranking helpers for the fountain browser's filters.

export type Svc = "in" | "out";
export type Water = "human" | "dog";
// A fountain with its distance and its filter classifications, precomputed once.
export type Ranked = { f: Fountain; distM: number | null; svc: Svc; water: Water };
export type Counts = {
  inN: number;
  outN: number;
  humanN: number;
  dogN: number;
};

// True when OSM tags flag this point as not human-potable (dog water).
export function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

// True when OSM lifecycle tags flag this point as no longer in service. This app
// marks a fountain out-of-service by moving `amenity` to `disused:`/`abandoned:`;
// a standalone `disused=yes` is also honored.
export function isOutOfService(tags: Record<string, string>): boolean {
  return (
    tags["disused:amenity"] != null || tags["abandoned:amenity"] != null || tags.disused === "yes"
  );
}

export const svcOf = (tags: Record<string, string>): Svc => (isOutOfService(tags) ? "out" : "in");
export const waterOf = (tags: Record<string, string>): Water =>
  isDogWater(tags) ? "dog" : "human";

export function fountainName(f: Fountain): string {
  return f.tags.name ?? "Unnamed fountain";
}

// Fountains sorted nearest-first (from the searched anchor), each tagged with
// distance + filter classes.
export function rankFountains(fountains: Fountain[], anchor: Pt | null): Ranked[] {
  return fountains
    .map((f) => ({
      f,
      distM: anchor ? haversine(anchor, f) : null,
      svc: svcOf(f.tags),
      water: waterOf(f.tags),
    }))
    .sort((a, b) => (a.distM ?? Infinity) - (b.distM ?? Infinity));
}

// Per-category totals for the filter counts (independent of the other dimensions).
export function countBy(ranked: Ranked[]): Counts {
  const c: Counts = { inN: 0, outN: 0, humanN: 0, dogN: 0 };
  for (const r of ranked) {
    if (r.svc === "in") c.inN++;
    else c.outN++;
    if (r.water === "human") c.humanN++;
    else c.dogN++;
  }
  return c;
}

// Toggle a value in a Set-typed filter without mutating the original.
export function toggled<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}
