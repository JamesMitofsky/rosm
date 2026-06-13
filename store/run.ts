import { create } from "zustand";
import type { Fountain } from "@/lib/schemas";
import type { Pt } from "@/lib/geo";

export type StopStatus =
  | "pending"
  | "confirm"
  | "out_of_order"
  | "removed"
  | "delete"
  | "skipped";

export type RunStop = Fountain & { status: StopStatus };

export type RunPlan = {
  start: Pt;
  loop: boolean;
  tagKey: string;
  stops: RunStop[];
  vias: Pt[]; // mandatory pass-through points (not survey targets)
  routeCoords: [number, number][]; // [lon,lat] from BRouter
  distanceM: number;
};

type RunState = RunPlan & {
  index: number;
  changesetId?: number;
  hasPlan: boolean;
  setPlan: (p: RunPlan) => void;
  hydrate: (p: RunPlan & { index?: number; changesetId?: number }) => void;
  setStatus: (id: number, status: StopStatus) => void;
  setIndex: (i: number) => void;
  setChangeset: (id: number) => void;
  reset: () => void;
};

const empty: RunPlan = {
  start: { lat: 0, lon: 0 },
  loop: true,
  tagKey: "amenity",
  stops: [],
  vias: [],
  routeCoords: [],
  distanceM: 0,
};

export const useRun = create<RunState>((set) => ({
  ...empty,
  index: 0,
  changesetId: undefined,
  hasPlan: false,
  setPlan: (p) => set({ ...p, index: 0, changesetId: undefined, hasPlan: true }),
  hydrate: (p) =>
    set({ ...p, index: p.index ?? 0, changesetId: p.changesetId, hasPlan: true }),
  setStatus: (id, status) =>
    set((s) => ({
      stops: s.stops.map((st) => (st.id === id ? { ...st, status } : st)),
    })),
  setIndex: (i) => set({ index: i }),
  setChangeset: (id) => set({ changesetId: id }),
  reset: () => set({ ...empty, index: 0, changesetId: undefined, hasPlan: false }),
}));
