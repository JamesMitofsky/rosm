import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Text, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet, RNHostView } from "@expo/ui";
import { usePlanner, inRouteIdsOf } from "@rosm/core/stores/planner";
import { useRun } from "@rosm/core/stores/run";
import { useOutbox } from "@rosm/core/stores/outbox";
import { fmtDist } from "@rosm/core/geo";
import type { Fountain } from "@rosm/core/schemas";
import { Button } from "../../components/ui/Button";
import { RosmMap, type RosmMarker } from "../../map/RosmMap";
import { ConfigPanel } from "../../components/planner/ConfigPanel";
import { RouteBuilderPanel } from "../../components/planner/RouteBuilderPanel";
import { PhaseNav } from "../../components/planner/PhaseNav";
import { usePlannerMarkers } from "../../components/planner/usePlannerMarkers";
import { usePlannerDraftSync } from "../../components/planner/usePlannerDraftSync";
import { useOsmEdits } from "../../run/useOsmEdits";
import { PointSheet } from "../../components/PointSheet";
import { hapticSelect } from "../../ports/haptics";

function markLabel(f: Fountain) {
  return f.tags.name ?? "Unnamed fountain";
}

// The Survey tab: a single persistent map for the whole planner lifetime, with
// the config wizard / route builder / run-in-progress card swapping in a bottom
// panel over it (the web planner keeps one MapView the same way). The run phase
// itself lives on the standalone /run screen.
export default function Plan() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();

  // Narrow slices only — the map re-diffs its native sources on prop changes,
  // so busy/err churn in the panels must not reach it.
  const phase = usePlanner((s) => s.phase);
  const center = usePlanner((s) => s.center);
  const recenterKey = usePlanner((s) => s.recenterKey);
  const line = usePlanner((s) => s.line);
  const tag = usePlanner((s) => s.tag);
  const fountains = usePlanner((s) => s.fountains);
  const stops = usePlanner((s) => s.stops);
  const pinnedIds = usePlanner((s) => s.pinnedIds);
  const excludedIds = usePlanner((s) => s.excludedIds);
  const distanceM = usePlanner((s) => s.distanceM);
  const resumable = usePlanner((s) => s.resumable);

  usePlannerDraftSync();
  const { edits, updatePoint } = useOsmEdits({ tagKey: tag.key });
  const markers = usePlannerMarkers({ edits });

  // Track the tapped point by id — the sheet opens instantly (spinner until the
  // fountain resolves), same pattern as the quick-update tab.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = useMemo(
    () => (selectedId == null ? null : (fountains.find((f) => f.id === selectedId) ?? null)),
    [fountains, selectedId],
  );
  const inRouteIds = useMemo(
    () => inRouteIdsOf({ stops, pinnedIds, excludedIds }),
    [stops, pinnedIds, excludedIds],
  );

  // A saved route from a prior session — offer to resume it, natively.
  useEffect(() => {
    if (!resumable) return;
    Alert.alert(
      "Resume your route?",
      `${resumable.stops.length} stops · ${fmtDist(resumable.distanceM)}`,
      [
        { text: "Start fresh", onPress: () => usePlanner.getState().dismissDraft() },
        { text: "Resume", isPreferred: true, onPress: () => usePlanner.getState().resumeDraft() },
      ],
    );
  }, [resumable]);

  // Config step 0: tap sets the start. Map phase: tap drops a via waypoint.
  const onMapPress = useCallback((lat: number, lon: number) => {
    usePlanner.getState().mapClick(lat, lon);
  }, []);

  // Numeric ids are fountains (toggling in route during build phase); "via-N" removes that waypoint;
  // the start flag and island highlight ignore taps.
  const onMarkerPress = useCallback(
    (id: RosmMarker["id"]) => {
      if (typeof id === "number") {
        if (phase === "map") {
          hapticSelect();
          usePlanner.getState().toggleStop(id);
          return;
        }
        setSelectedId(id);
        return;
      }
      if (id.startsWith("via-")) {
        hapticSelect();
        usePlanner.getState().removeVia(Number(id.slice(4)));
      }
    },
    [phase],
  );

  const startRun = useCallback(async () => {
    await usePlanner.getState().startRun();
    router.replace("/run");
  }, [router]);

  const confirmEndRun = useCallback(() => {
    Alert.alert("End this run?", "Progress is archived; queued edits keep syncing.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End run",
        style: "destructive",
        onPress: () => {
          useRun.getState().reset();
          useOutbox.getState().clear();
          usePlanner.getState().resetAfterRun();
        },
      },
    ]);
  }, []);

  const mapCenter: [number, number] = center ? [center.lat, center.lon] : [20, 0];
  const userPos: [number, number] | null = useMemo(
    () => (center ? [center.lat, center.lon] : null),
    [center],
  );

  return (
    <View className="bg-paper flex-1">
      <RosmMap
        center={mapCenter}
        zoom={center ? 15 : 1.5}
        markers={markers}
        line={line}
        userPos={userPos}
        initialOnly
        recenterKey={recenterKey}
        onMapPress={onMapPress}
        onMarkerPress={onMarkerPress}
      />

      {/* Planner controls pinned to the bottom of the screen, full-width,
          matching the active-run panel in run.tsx. */}
      <View className="bg-paper border-ink/10 absolute right-0 bottom-0 left-0 border-t px-5 pt-5 pb-28">
        {phase === "config" ? (
          <ConfigPanel />
        ) : phase === "map" ? (
          <RouteBuilderPanel onStartRun={startRun} />
        ) : (
          <View className="gap-3">
            <Text className="text-ink font-bold">
              Run in progress — {stops.length} stops · {fmtDist(distanceM)}
            </Text>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button title="Open run" onPress={() => router.push("/run")} />
              </View>
              <Button title="End run" variant="danger" onPress={confirmEndRun} />
            </View>
            {/* Last view — step back to the builder; no forward. */}
            <PhaseNav
              back={{
                label: "Pick fountains",
                onPress: () => usePlanner.getState().setPhase("map"),
              }}
            />
          </View>
        )}
      </View>

      {/* Native OS bottom sheet for the tapped point (same host pattern as the
          quick-update tab — see the comments there for the sizing workaround). */}
      <BottomSheet isPresented={selectedId != null} onDismiss={() => setSelectedId(null)}>
        <RNHostView matchContents>
          <View style={{ width: winW - 32 }}>
            {selected ? (
              <PointSheet
                fountain={selected}
                edit={edits[selected.id]}
                inRoute={inRouteIds.has(selected.id)}
                onToggleRoute={() => {
                  hapticSelect();
                  usePlanner.getState().toggleStop(selected.id);
                  setSelectedId(null);
                }}
                onAction={(action, extras) =>
                  updatePoint(selected.id, action, markLabel(selected), extras)
                }
              />
            ) : (
              <View className="items-center justify-center py-12">
                <ActivityIndicator />
              </View>
            )}
          </View>
        </RNHostView>
      </BottomSheet>
    </View>
  );
}
