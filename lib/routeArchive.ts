"use client";

import type { Pt } from "@/lib/geo";
import type { Fountain } from "@/lib/schemas";
import type { RunStop } from "@/store/run";
import type { OutboxItem } from "@/store/outbox";

// Durable on-device record of every route the surveyor runs. Replaces the old
// "Export JSON backup" download: instead of a one-off file the user has to
// remember to save, each route — plus every node change made along the way — is
// written to localStorage automatically and kept across N routes. Survives
// reloads, OSM submission failures, and moving between runs.
//
// Keyed by routeId so a single run is updated in place (not duplicated) as it
// progresses and across reloads. The newest snapshot wins.

const KEY = "run-for-maps:archive";

export type ArchivedRoute = {
  routeId: string;
  startedAt: string; // ISO — first time this route was archived
  updatedAt: string; // ISO — last snapshot
  plan: {
    start: Pt;
    loop: boolean;
    tagKey: string;
    tagValue: string;
    stops: RunStop[]; // carries each node's recorded status
    vias: Pt[];
    added: Fountain[]; // nodes created on the fly
    routeCoords: [number, number][];
    distanceM: number;
    index: number;
    changesetId?: number;
  };
  edits: OutboxItem[]; // full outbox: per-edit changeset + sync state
};

export type RouteSnapshot = Pick<ArchivedRoute, "routeId" | "plan" | "edits">;

function loadAll(): ArchivedRoute[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return []; // corrupt / unavailable storage — start fresh rather than throw
  }
}

function saveAll(list: ArchivedRoute[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or disabled — archiving is best-effort, never block the run
  }
}

// Upsert one route's current state into the archive. Called on every persist so
// node changes are captured as they happen.
export function archiveRoute(snap: RouteSnapshot) {
  if (!snap.routeId) return;
  const now = new Date().toISOString();
  const list = loadAll();
  const i = list.findIndex((r) => r.routeId === snap.routeId);
  if (i === -1) {
    list.push({ ...snap, startedAt: now, updatedAt: now });
  } else {
    list[i] = { ...list[i], ...snap, updatedAt: now };
  }
  saveAll(list);
}

// Read the full archive, newest run first. For surfacing past routes later.
export function getArchivedRoutes(): ArchivedRoute[] {
  return loadAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
