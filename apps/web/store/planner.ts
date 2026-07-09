import { create } from "zustand";
import { planRoute } from "@/lib/plan";
import { milesToMeters, type Pt } from "@/lib/geo";
import type { Turn } from "@/lib/brouter";
import type { Fountain, RecencyMode } from "@/lib/schemas";
import { useRun, type RunStop } from "@/store/run";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";

// The planner's state and route-building I/O, moved out of the /plan page so
// the config wizard, route builder, and map feed can live in separate
// components without prop-drilling ~30 values. The planner is a single-instance
// surface (one /plan page), so a global store is safe — same pattern as
// store/run and store/outbox.

// Snapshot of an in-progress planner route, persisted so a refresh can resume it.
export type Draft = {
  center: Pt;
  tag: { key: string; value: string };
  radiusMi: number | "";
  recencyMode: RecencyMode;
  recencyMonths: number | "";
  targetMi: number | "";
  loop: boolean;
  fountains: Fountain[];
  pinnedIds: number[];
  excludedIds: number[];
  vias: Pt[];
  stops: Fountain[];
  line: [number, number][];
  distanceM: number;
  turns: Turn[];
  autoCount: number;
};

export type PlannerPhase = "config" | "map" | "run";
export type SizeMode = "distance" | "points";

// Module-scoped monotonic counters (the planner is a single-instance route).
// `planRequestSeq` drops stale overlapping plans; `recenterSeq` forces the map
// to recenter even when coords repeat.
let planRequestSeq = 0;
let recenterSeq = 0;

type PlannerState = {
  // "config" walks the questions; "map" hides them to build the route; "run"
  // takes the SAME map live for the survey, swapping only the side panel.
  phase: PlannerPhase;
  step: number;

  center: Pt | null;
  vias: Pt[];
  pinnedIds: number[];
  recenterKey: string;
  addr: string;
  radiusMi: number | "";
  // Recency filter: by default surface points NOT surveyed in the last 6 months
  // (the ones worth verifying on the ground). "fresh" flips it; "any" disables.
  recencyMode: RecencyMode;
  recencyMonths: number | "";
  targetMi: number | "";
  // How the route is sized: to a target distance, or purely by the points picked.
  sizeMode: SizeMode;
  loop: boolean;
  tag: { key: string; value: string };

  fountains: Fountain[];
  stops: Fountain[];
  // Points the user explicitly took OUT of the route (e.g. auto-grabbed ones they
  // don't want). They stay excluded so re-planning / auto-pickup won't re-add them.
  excludedIds: number[];
  line: [number, number][];
  distanceM: number;
  turns: Turn[];
  // True once a route is built; gates auto-replan so picks/removes update the
  // route live without re-running the whole planner by hand.
  hasRoute: boolean;
  // Coords of a point BRouter can't reach on foot ("target island").
  islandPt: Pt | null;
  // How many stops were auto-grabbed (tiny detour off the route).
  autoCount: number;
  busy: string | null;
  err: string | null;
  // Whether the current error is a transient server failure worth retrying.
  errRetryable: boolean;

  // Session recovery: a saved route from a previous (interrupted) session, and a
  // gate so we don't persist a draft until the initial load has run.
  resumable: Draft | null;
  draftReady: boolean;

  setPhase: (phase: PlannerPhase) => void;
  setStep: (step: number) => void;
  setAddr: (addr: string) => void;
  setRadiusMi: (v: number | "") => void;
  setRecencyMode: (m: RecencyMode) => void;
  setRecencyMonths: (v: number | "") => void;
  setTargetMi: (v: number | "") => void;
  setSizeMode: (m: SizeMode) => void;
  setLoop: (loop: boolean) => void;
  setErr: (err: string | null) => void;

  recenter: (p: Pt) => void;
  geolocate: () => void;
  searchAddr: () => Promise<void>;
  findPoints: () => Promise<void>;
  finishConfig: () => Promise<void>;
  planAndRoute: () => Promise<void>;
  replan: () => void;
  makeRoute: () => Promise<void>;
  reverseRoute: () => Promise<void>;
  addStop: (id: number) => void;
  removeStop: (id: number) => void;
  toggleStop: (id: number) => void;
  restoreStop: (id: number) => void;
  mapClick: (lat: number, lon: number) => void;
  removeVia: (i: number) => void;
  loadDraft: () => Promise<void>;
  resumeDraft: () => void;
  dismissDraft: () => void;
  startRun: () => Promise<void>;
  // The state-clearing half of leaving a finished run; the page also resets the
  // run session. Keeps the start area so the surveyor can build another route.
  resetAfterRun: () => void;
};

// Derived helpers (plain functions so components can memo over primitive slices).

// The user pins, resolved to fountains and forced into the route. Excluded
// points can never be pinned (removing a point also unpins it).
export function pinnedOf(s: Pick<PlannerState, "fountains" | "pinnedIds" | "excludedIds">) {
  return s.fountains.filter((f) => s.pinnedIds.includes(f.id) && !s.excludedIds.includes(f.id));
}

// Points the user removed from the route, resolved to fountains for the list.
export function removedOf(s: Pick<PlannerState, "fountains" | "excludedIds">) {
  return s.fountains.filter((f) => s.excludedIds.includes(f.id));
}

// A point is "in the route" if it's a chosen stop or a required pin (and not
// explicitly removed). Drives marker color + the popup's add/remove toggle.
export function inRouteIdsOf(s: Pick<PlannerState, "stops" | "pinnedIds" | "excludedIds">) {
  const ids = new Set<number>(s.pinnedIds);
  s.stops.forEach((f) => ids.add(f.id));
  s.excludedIds.forEach((id) => ids.delete(id));
  return ids;
}

export const usePlanner = create<PlannerState>((set, get) => ({
  phase: "config",
  step: 0,

  center: null,
  vias: [],
  pinnedIds: [],
  recenterKey: "init",
  addr: "",
  radiusMi: 3,
  recencyMode: "stale",
  recencyMonths: 6,
  targetMi: "",
  // Default to points so the route is sized by what the user picks unless they
  // opt into a target distance (matches "empty target distance by default").
  sizeMode: "points",
  loop: true,
  tag: { key: "amenity", value: "drinking_water" },

  fountains: [],
  stops: [],
  excludedIds: [],
  line: [],
  distanceM: 0,
  turns: [],
  hasRoute: false,
  islandPt: null,
  autoCount: 0,
  busy: null,
  err: null,
  errRetryable: false,

  resumable: null,
  draftReady: false,

  setPhase: (phase) => set({ phase }),
  setStep: (step) => set({ step }),
  setAddr: (addr) => set({ addr }),
  setRadiusMi: (radiusMi) => set({ radiusMi }),
  setRecencyMode: (recencyMode) => set({ recencyMode }),
  setRecencyMonths: (recencyMonths) => set({ recencyMonths }),
  setTargetMi: (targetMi) => set({ targetMi }),
  setSizeMode: (sizeMode) => set({ sizeMode }),
  setLoop: (loop) => {
    set({ loop });
    get().replan();
  },
  setErr: (err) => set({ err }),

  recenter: (p) => {
    set({ center: p, recenterKey: `${p.lat},${p.lon},${++recenterSeq}` });
  },

  geolocate: () => {
    set({ err: null });
    getCurrentPosition()
      .then((p) => get().recenter({ lat: p.lat, lon: p.lon }))
      .catch((e) => set({ err: `Geolocation failed: ${(e as Error).message}` }));
  },

  searchAddr: async () => {
    const { addr } = get();
    if (!addr.trim()) return;
    set({ busy: "search", err: null });
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(addr)}`,
      );
      const j = (await r.json()) as { lat: string; lon: string }[];
      if (j[0]) get().recenter({ lat: Number(j[0].lat), lon: Number(j[0].lon) });
      else set({ err: "Address not found" });
    } catch (e) {
      set({ err: (e as Error).message });
    } finally {
      set({ busy: null });
    }
  },

  findPoints: async () => {
    const { center, radiusMi, tag, recencyMode, recencyMonths } = get();
    if (!center) return;
    // Building fresh — drop any pending resume offer so the new route persists.
    set({
      resumable: null,
      busy: "find",
      err: null,
      errRetryable: false,
      stops: [],
      line: [],
      turns: [],
      pinnedIds: [],
      excludedIds: [],
      autoCount: 0,
      hasRoute: false,
      islandPt: null,
    });
    try {
      const r = await apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...center,
          radiusM: milesToMeters(radiusMi || 0),
          tag,
          recencyMode,
          recencyMonths: recencyMonths || 6,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const e = j.error;
        // Error can be a zod flatten ({formErrors}), a structured Overpass
        // error ({message, retryable}), or a plain string.
        const msg =
          e?.formErrors?.join(", ") ||
          e?.message ||
          (typeof e === "string" ? e : "") ||
          "Couldn't load points. Please try again.";
        set({ errRetryable: !!e?.retryable });
        throw new Error(msg);
      }
      set({ fountains: j.fountains });
      if (j.fountains.length === 0) set({ err: "No matching points in radius." });
    } catch (e) {
      set({ err: (e as Error).message });
    } finally {
      set({ busy: null });
    }
  },

  // Last config step: run the search, then hand the screen over to the map.
  finishConfig: async () => {
    await get().findPoints();
    set({ phase: "map" });
  },

  // Plan + fetch street geometry. Unlike the old page-local version there is no
  // override threading: store actions write state synchronously, so `get()`
  // always sees the latest picks.
  planAndRoute: async () => {
    const { center, fountains, pinnedIds, excludedIds, vias, loop, sizeMode, targetMi } = get();
    if (!center || fountains.length === 0) return;
    // In points mode the route is sized purely by what the user picks, so the
    // target distance is ignored even if a value is left in the field.
    const target = sizeMode === "distance" ? targetMi || 0 : 0;
    // Rapid taps fire overlapping plans; only the latest may write results, so a
    // slow earlier fetch can't clobber a newer route.
    const seq = ++planRequestSeq;
    const fresh = () => seq === planRequestSeq;
    set({ busy: "route", err: null, islandPt: null });
    try {
      const { ordered, autoIds } = planRoute({
        start: center,
        // Excluded points are out of the running entirely — never re-picked.
        candidates: fountains.filter((f) => !excludedIds.includes(f.id)),
        vias,
        pinned: fountains.filter((f) => pinnedIds.includes(f.id) && !excludedIds.includes(f.id)),
        targetM: milesToMeters(target),
        loop,
      });
      const chosen = ordered.filter((n) => n.fountain).map((n) => n.fountain!);
      if (ordered.length === 0) {
        if (!fresh()) return;
        set({
          err:
            sizeMode === "distance"
              ? "No points fit that distance. Increase target distance or add via-points."
              : "No points left in the route — add one back or pin a point.",
          stops: [],
          line: [],
          distanceM: 0,
          turns: [],
          autoCount: 0,
          // Stay "live" (don't reset hasRoute) so adding a point back re-plans.
        });
        return;
      }
      const points = [center, ...ordered.map((n) => ({ lat: n.lat, lon: n.lon }))];
      const r = await apiFetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, loop }),
      });
      const j = await r.json();
      if (!fresh()) return; // a newer plan superseded this one
      if (!r.ok) {
        if (j.island) set({ islandPt: j.island as Pt });
        throw new Error(j.error || "routing failed");
      }
      set({
        stops: chosen,
        autoCount: autoIds.length,
        line: (j.coords as [number, number][]).map(([lon, lat]) => [lat, lon]),
        distanceM: j.distanceM,
        turns: (j.turns as Turn[]) ?? [],
        hasRoute: true,
      });
    } catch (e) {
      if (fresh()) set({ err: (e as Error).message });
    } finally {
      if (fresh()) set({ busy: null });
    }
  },

  // Once a route exists, every membership change re-plans immediately. A no-op
  // before the first route is built (the "Plan route" button does that).
  replan: () => {
    if (get().hasRoute) get().planAndRoute();
  },

  // "Plan route" button: validate inputs, then build.
  makeRoute: async () => {
    const s = get();
    if (!s.center || s.fountains.length === 0) return;
    const target = s.sizeMode === "distance" ? s.targetMi || 0 : 0;
    if (s.sizeMode === "distance" && target <= 0) {
      set({ err: "Enter a target distance." });
      return;
    }
    // Points mode: the route is sized by the points the user picks — so they have
    // to pick at least one (a pin or a waypoint) to define it.
    if (s.sizeMode === "points" && pinnedOf(s).length === 0 && s.vias.length === 0) {
      set({ err: "Pin a point or add a waypoint to size your route." });
      return;
    }
    await get().planAndRoute();
  },

  // Flip the visiting order of the route. Start (your location) stays fixed; the
  // stops are walked in reverse, and the street geometry is re-fetched so one-way
  // streets and turn costs are respected in the new direction.
  reverseRoute: async () => {
    const { center, stops, busy, loop } = get();
    if (!center || stops.length < 2 || busy !== null) return;
    const reversed = [...stops].reverse();
    set({ busy: "reverse", err: null, islandPt: null });
    const seq = ++planRequestSeq;
    const fresh = () => seq === planRequestSeq;
    try {
      const points = [center, ...reversed.map((f) => ({ lat: f.lat, lon: f.lon }))];
      const r = await apiFetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points, loop }),
      });
      const j = await r.json();
      if (!fresh()) return;
      if (!r.ok) {
        if (j.island) set({ islandPt: j.island as Pt });
        throw new Error(j.error || "routing failed");
      }
      set({
        stops: reversed,
        line: (j.coords as [number, number][]).map(([lon, lat]) => [lat, lon]),
        distanceM: j.distanceM,
        turns: (j.turns as Turn[]) ?? [],
      });
    } catch (e) {
      if (fresh()) set({ err: (e as Error).message });
    } finally {
      if (fresh()) set({ busy: null });
    }
  },

  // Force a point into the route (pin it) and clear any prior removal.
  addStop: (id) => {
    const { pinnedIds, excludedIds } = get();
    set({
      excludedIds: excludedIds.filter((x) => x !== id),
      pinnedIds: pinnedIds.includes(id) ? pinnedIds : [...pinnedIds, id],
    });
    get().replan();
  },

  // Take a point out of the route and keep it out: exclude it (so re-planning /
  // auto-pickup won't grab it again) and drop any pin.
  removeStop: (id) => {
    const { pinnedIds, excludedIds } = get();
    set({
      pinnedIds: pinnedIds.filter((x) => x !== id),
      excludedIds: excludedIds.includes(id) ? excludedIds : [...excludedIds, id],
    });
    get().replan();
  },

  // Tap a marker to add it; tap again to remove it. The route re-plans on every
  // change.
  toggleStop: (id) => {
    if (inRouteIdsOf(get()).has(id)) get().removeStop(id);
    else get().addStop(id);
  },

  // Undo a removal: let the planner consider the point again (it may be re-picked
  // by distance fill or small-detour pickup).
  restoreStop: (id) => {
    set({ excludedIds: get().excludedIds.filter((x) => x !== id) });
    get().replan();
  },

  mapClick: (lat, lon) => {
    const { phase, step, center, vias } = get();
    // The start point can only be set during the first setup step ("where").
    // Later config steps ignore map clicks so the start can't move by accident.
    if (phase === "config") {
      if (step === 0) get().recenter({ lat, lon });
      return;
    }
    // Map phase: a click drops a pass-through waypoint.
    if (center) {
      set({ vias: [...vias, { lat, lon }] });
      get().replan();
    }
  },

  // Remove a pass-through waypoint and re-plan around the rest.
  removeVia: (i) => {
    set({ vias: get().vias.filter((_, j) => j !== i) });
    get().replan();
  },

  // On mount, look for a saved route from a prior session. If one exists (and no
  // route is already live in memory), offer to resume it rather than restoring
  // silently — the user may want a fresh plan.
  loadDraft: async () => {
    try {
      const r = await apiFetch("/api/draft");
      const d = (await r.json()) as Draft | null;
      if (d && d.stops?.length && get().stops.length === 0) set({ resumable: d });
    } catch {
      // No draft (or it couldn't be read) — nothing to offer.
    } finally {
      set({ draftReady: true });
    }
  },

  // Restore a saved route into the planner and jump to the map.
  resumeDraft: () => {
    const d = get().resumable;
    if (!d) return;
    get().recenter(d.center);
    set({
      tag: d.tag,
      radiusMi: d.radiusMi,
      recencyMode: d.recencyMode ?? "stale",
      recencyMonths: d.recencyMonths ?? 6,
      targetMi: d.targetMi,
      loop: d.loop,
      fountains: d.fountains,
      pinnedIds: d.pinnedIds,
      excludedIds: d.excludedIds ?? [],
      vias: d.vias,
      stops: d.stops,
      line: d.line,
      distanceM: d.distanceM,
      turns: d.turns ?? [],
      autoCount: d.autoCount,
      hasRoute: d.stops.length > 0,
      resumable: null,
      phase: "map",
    });
  },

  // Drop the saved route — the user wants to start fresh.
  dismissDraft: () => {
    set({ resumable: null });
    apiFetch("/api/draft", { method: "DELETE" }).catch(() => {});
  },

  startRun: async () => {
    const { center, stops, loop, tag, vias, fountains, line, distanceM, turns } = get();
    if (!center || stops.length === 0) return;
    const runStops: RunStop[] = stops.map((f) => ({ ...f, status: "pending" }));
    const plan = {
      start: center,
      loop,
      tagKey: tag.key,
      tagValue: tag.value,
      stops: runStops,
      vias,
      pool: fountains,
      added: [],
      routeCoords: line.map(([lat, lon]) => [lon, lat] as [number, number]),
      distanceM,
      turns,
    };
    useRun.getState().setPlan(plan);
    await apiFetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...plan, index: 0 }),
    });
    // Route promoted to an active run; drop the planner draft so we don't re-offer it.
    apiFetch("/api/draft", { method: "DELETE" }).catch(() => {});
    // Stay on this map — just hand the side panel over to the live run.
    set({ phase: "run" });
  },

  resetAfterRun: () =>
    set({
      stops: [],
      line: [],
      turns: [],
      fountains: [],
      hasRoute: false,
      pinnedIds: [],
      excludedIds: [],
      vias: [],
      distanceM: 0,
      autoCount: 0,
      step: 0,
      phase: "config",
    }),
}));
