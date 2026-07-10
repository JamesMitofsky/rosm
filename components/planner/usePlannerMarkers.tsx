"use client";

import { useMemo } from "react";
import type { MapMarker } from "@/components/MapView";
import PointPopup, { type PointEdit } from "@/components/PointPopup";
import { usePlanner, inRouteIdsOf } from "@/store/planner";
import { EDIT_COLOR, EDIT_LABEL } from "@/lib/editStatus";
import type { EditAction, EditExtras, Fountain } from "@/lib/schemas";

function markLabel(f: Fountain) {
  return f.tags.name ?? "Unnamed fountain";
}

// The planner-phase marker set: every found fountain (colored by its route /
// pin / exclusion / edit state), plus via waypoints, the start flag, and the
// unreachable-island highlight. The run phase feeds the map from useRunSession
// instead.
export function usePlannerMarkers({
  edits,
  updatePoint,
  loggedIn,
}: {
  edits: Record<number, PointEdit>;
  updatePoint: (nodeId: number, action: EditAction, name?: string, extras?: EditExtras) => void;
  loggedIn: boolean;
}): MapMarker[] {
  const fountains = usePlanner((s) => s.fountains);
  const stops = usePlanner((s) => s.stops);
  const pinnedIds = usePlanner((s) => s.pinnedIds);
  const excludedIds = usePlanner((s) => s.excludedIds);
  const vias = usePlanner((s) => s.vias);
  const center = usePlanner((s) => s.center);
  const islandPt = usePlanner((s) => s.islandPt);

  const inRouteIds = useMemo(
    () => inRouteIdsOf({ stops, pinnedIds, excludedIds }),
    [stops, pinnedIds, excludedIds],
  );

  return useMemo(() => {
    // Zustand actions are referentially stable; read them off the store so the
    // memo deps stay honest.
    const { toggleStop, removeVia } = usePlanner.getState();

    const chosenIds = new Map(stops.map((s, i) => [s.id, i + 1]));
    const pinnedSet = new Set(pinnedIds);
    const excludedSet = new Set(excludedIds);

    const fountainMarkers: MapMarker[] = fountains.map((f) => {
      const n = chosenIds.get(f.id);
      const isPinned = pinnedSet.has(f.id);
      const isExcluded = excludedSet.has(f.id);
      const inRoute = inRouteIds.has(f.id);
      const edit = edits[f.id];
      // edited (this session) wins; then: dim "–" = explicitly removed; green
      // numbered = chosen; amber star = pinned (forced); gray = available.
      const color = edit
        ? (EDIT_COLOR[edit.status] ?? "#9ca3af")
        : isExcluded
          ? "#52525b"
          : n
            ? "#16a34a"
            : isPinned
              ? "#f59e0b"
              : "#9ca3af";
      const label = edit
        ? EDIT_LABEL[edit.status]
        : isExcluded
          ? "–"
          : n
            ? String(n)
            : isPinned
              ? "★"
              : undefined;
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color,
        label,
        // Tapping the point opens its popup; the route toggle + OSM updates live
        // inside it (no hidden long-press gesture on the GL layer).
        popup: (
          <PointPopup
            fountain={f}
            loggedIn={loggedIn}
            inRoute={inRoute}
            edit={edit}
            busy={false}
            onToggleRoute={() => toggleStop(f.id)}
            onAction={(action, extras) => updatePoint(f.id, action, markLabel(f), extras)}
          />
        ),
      };
    });

    const viaMarkers: MapMarker[] = vias.map((v, i) => ({
      id: `via-${i}`,
      lat: v.lat,
      lon: v.lon,
      color: "#7c3aed",
      label: "✦",
      onClick: () => removeVia(i),
    }));

    const startMarker: MapMarker[] = center
      ? [{ id: "start", lat: center.lat, lon: center.lon, color: "#16a34a", label: "⚑" }]
      : [];

    // Highlight the unreachable ("target island") point, if any.
    const islandMarker: MapMarker[] = islandPt
      ? [{ id: "island", lat: islandPt.lat, lon: islandPt.lon, color: "#dc2626", label: "!" }]
      : [];

    return [...fountainMarkers, ...viaMarkers, ...startMarker, ...islandMarker];
  }, [
    fountains,
    stops,
    pinnedIds,
    excludedIds,
    vias,
    center,
    islandPt,
    inRouteIds,
    edits,
    loggedIn,
    updatePoint,
  ]);
}
