import { create } from "zustand";
import type { Fountain } from "@/lib/schemas";
import type { Pt } from "@/lib/geo";

export type StopStatus =
  | "pending"
  | "confirm"
  | "out_of_order"
  | "removed"
  | "skipped";

export type RunStop = Fountain & { status: StopStatus };

export type RunPlan = {
  start: Pt;
  loop: boolean;
  tagKey: string;
  tagValue: string; // pair with tagKey to tag newly-added nodes (e.g. drinking_water)
  stops: RunStop[];
  vias: Pt[]; // mandatory pass-through points (not survey targets)
  added: Fountain[]; // new nodes created on the fly during the run
  routeCoords: [number, number][]; // [lon,lat] from BRouter
  distanceM: number;
};

type RunState = RunPlan & {
  index: number;
  changesetId?: number;
  routeId: string; // stable id for this run, used to key the localStorage archive
  hasPlan: boolean;
  setPlan: (p: RunPlan) => void;
  hydrate: (
    p: RunPlan & { index?: number; changesetId?: number; routeId?: string },
  ) => void;
  setStatus: (id: number, status: StopStatus) => void;
  setIndex: (i: number) => void;
  setChangeset: (id: number) => void;
  addNode: (f: Fountain) => void;
  reset: () => void;
};

const empty: RunPlan = {
  start: { lat: 0, lon: 0 },
  loop: true,
  tagKey: "amenity",
  tagValue: "drinking_water",
  stops: [],
  vias: [],
  added: [],
  routeCoords: [],
  distanceM: 0,
};

function newRouteId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export const useRun = create<RunState>((set) => ({
  ...empty,
  index: 0,
  changesetId: undefined,
  routeId: "",
  hasPlan: false,
  setPlan: (p) =>
    set({ ...p, index: 0, changesetId: undefined, routeId: newRouteId(), hasPlan: true }),
  hydrate: (p) =>
    set({
      ...p,
      // Back-compat: runs persisted before these fields existed.
      tagValue: p.tagValue ?? empty.tagValue,
      added: p.added ?? [],
      index: p.index ?? 0,
      changesetId: p.changesetId,
      routeId: p.routeId ?? newRouteId(),
      hasPlan: true,
    }),
  setStatus: (id, status) =>
    set((s) => ({
      stops: s.stops.map((st) => (st.id === id ? { ...st, status } : st)),
    })),
  setIndex: (i) => set({ index: i }),
  setChangeset: (id) => set({ changesetId: id }),
  addNode: (f) => set((s) => ({ added: [...s.added, f] })),
  reset: () =>
    set({ ...empty, index: 0, changesetId: undefined, routeId: "", hasPlan: false }),
}));
