import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet, RNHostView } from "@expo/ui";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  DogIcon,
  PlusCircleIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TrashIcon,
  WarningIcon,
} from "phosphor-react-native";
import { useOutbox } from "@rosm/core/stores/outbox";
import { usePlanner } from "@rosm/core/stores/planner";
import type { EditAction } from "@rosm/core/schemas";
import { fmtDist, maneuver } from "@rosm/core/geo";
import { SafeArea } from "../components/ui/SafeArea";
import { useRunSession } from "../run/useRunSession";
import { RosmMap, type RosmMarker } from "../map/RosmMap";
import { Button } from "../components/ui/Button";
import { PointSheet, type PointEdit } from "../components/PointSheet";

// The four arrival actions, mirroring the web RunGuide (and PointSheet's order).
const ACTIONS: { action: EditAction; title: string; Icon: typeof CheckCircleIcon; box: string }[] =
  [
    { action: "confirm", title: "Working — confirm", Icon: CheckCircleIcon, box: "bg-green-600" },
    { action: "out_of_order", title: "Out of order", Icon: WarningIcon, box: "bg-amber-500" },
    { action: "removed", title: "Removed", Icon: TrashIcon, box: "bg-red-600" },
  ];

// Standalone run: live HUD over the shared map, driven by the run session hook.
// Recovers an interrupted run from the archive on cold start. Any marker —
// routed stop, pool point off the route, or a node added on the fly — opens the
// point sheet so it can be updated mid-run without advancing the target.
export default function Run() {
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const s = useRunSession({ enabled: true });

  // Skip and back both jump stops, so gate each behind an inline confirm.
  // Keying on the stop index auto-dismisses the prompt when the stop changes.
  const [confirm, setConfirm] = useState<{ i: number; action: "skip" | "back" } | null>(null);
  const pending = confirm?.i === s.index ? confirm.action : null;

  // Tapped marker → point sheet. Resolve against stops first (keeps status),
  // then on-the-fly adds and the off-route pool.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedNode = useMemo(() => {
    if (selectedId == null) return null;
    const inStops = s.stops.find((x) => x.id === selectedId);
    if (inStops) return inStops;
    const extra = [...s.added, ...s.pool].find((x) => x.id === selectedId);
    return extra ? { ...extra, status: "pending" as const } : null;
  }, [selectedId, s.stops, s.added, s.pool]);

  // Edits recorded this session, for the sheet's saved-state view.
  const outboxItems = useOutbox((st) => st.items);
  const edits = useMemo(() => {
    const m: Record<number, PointEdit> = {};
    for (const it of outboxItems) {
      m[it.nodeId] = {
        status: it.action,
        summary: it.summary,
        syncState: it.syncState,
        changesetUrl: it.changesetUrl,
        extras: it.extras,
      };
    }
    return m;
  }, [outboxItems]);

  const onMarkerPress = (id: RosmMarker["id"]) => {
    if (typeof id === "number") setSelectedId(id);
  };

  if (s.closed) {
    const surveyed = s.stops.filter((x) => x.status !== "pending" && x.status !== "skipped").length;
    return (
      <SafeArea className="bg-ink flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-cream text-2xl font-bold">Run complete</Text>
        <Text className="text-cream-dim">
          You surveyed {surveyed} {surveyed === 1 ? "point" : "points"}. Nice work!
        </Text>
        {s.closed.changesetUrl ? (
          <Pressable
            onPress={() => Linking.openURL(s.closed!.changesetUrl!)}
            accessibilityRole="link"
            className="flex-row items-center gap-1.5"
          >
            <ArrowSquareOutIcon size={16} color="#ccff2e" />
            <Text className="text-volt font-semibold underline">View changeset on OSM</Text>
          </Pressable>
        ) : null}
        <Button
          title="Done"
          onPress={() => {
            s.reset();
            // Clear the planner too, so the Survey tab starts a fresh config
            // instead of falling back into the stale map phase.
            usePlanner.getState().resetAfterRun();
            router.replace("/plan");
          }}
        />
      </SafeArea>
    );
  }

  return (
    <View className="bg-ink flex-1">
      <RosmMap
        center={s.center}
        markers={s.markers}
        line={s.line}
        userPos={s.userPos}
        recenterKey={s.recenterKey}
        fitPoints={s.fitPoints}
        onMarkerPress={onMarkerPress}
      />
      <SafeArea edges={["bottom"]} className="absolute right-0 bottom-0 left-0 p-4">
        <View className="bg-ink-soft gap-3 rounded-2xl p-4">
          {s.done ? (
            <>
              <Text className="text-cream text-lg font-bold">All points surveyed</Text>
              <Button title="Finish & close changeset" onPress={s.finish} loading={s.finishing} />
            </>
          ) : s.target ? (
            <>
              <Text className="text-cream text-lg font-bold">
                {s.target.tags?.name ?? `Node ${s.target.id}`}
              </Text>
              <Text className="text-cream-dim">
                {s.distToTarget != null ? `${fmtDist(s.distToTarget)} ${s.heading}` : "Locating…"}
                {s.nextTurn
                  ? ` · ${maneuver(s.nextTurn.angle)} in ${fmtDist(s.distToTurn ?? 0)}`
                  : ""}
              </Text>

              {s.target.tags?.drinking_water === "no" ? (
                <View className="flex-row items-center gap-1.5">
                  <DogIcon size={16} color="#a78bfa" weight="fill" />
                  <Text className="text-sm font-medium text-violet-400">
                    Dog water — not for humans
                  </Text>
                </View>
              ) : null}

              {s.osm && !s.osm.loggedIn ? (
                <Text className="text-cream-dim text-xs">
                  Sign in to OSM (Profile tab) to record updates.
                </Text>
              ) : null}

              {pending ? (
                // Inline confirmation for the stop-jumping actions (skip / back).
                <View className="gap-2">
                  <Text className="text-cream text-sm font-medium">
                    {pending === "skip"
                      ? "Skip this stop? It’ll be marked skipped and you’ll move on."
                      : "Go back to the previous stop? It’ll be re-opened for action."}
                  </Text>
                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Button title="Cancel" variant="ghost" onPress={() => setConfirm(null)} />
                    </View>
                    <View className="flex-1">
                      <Button
                        title={pending === "skip" ? "Skip stop" : "Go back"}
                        onPress={() => {
                          setConfirm(null);
                          if (pending === "skip") s.skip();
                          else s.goBack();
                        }}
                      />
                    </View>
                  </View>
                </View>
              ) : s.arrived ? (
                <View className="gap-2">
                  {ACTIONS.map(({ action, title, Icon, box }) => (
                    <Pressable
                      key={action}
                      onPress={() => s.record(action)}
                      accessibilityRole="button"
                      className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${box}`}
                    >
                      <Icon size={18} color="#ffffff" weight="bold" />
                      <Text className="text-base font-bold text-white">{title}</Text>
                    </Pressable>
                  ))}
                  <Button
                    title="Skip"
                    variant="ghost"
                    onPress={() => setConfirm({ i: s.index, action: "skip" })}
                  />
                </View>
              ) : (
                <View className="gap-2">
                  <View className="flex-row gap-2">
                    {/* Add a new node of the surveyed type at the current GPS. */}
                    <Pressable
                      onPress={s.addHere}
                      disabled={!s.osm?.loggedIn || s.adding || !s.userPos}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${s.addLabel} here`}
                      className={`border-sky-deep/60 items-center justify-center rounded-xl border px-4 py-3 ${
                        !s.osm?.loggedIn || s.adding || !s.userPos ? "opacity-50" : ""
                      }`}
                    >
                      {s.adding ? (
                        <ActivityIndicator size="small" color="#4fafd4" />
                      ) : (
                        <PlusCircleIcon size={22} color="#4fafd4" weight="bold" />
                      )}
                    </Pressable>
                    <View className="flex-1">
                      <Button title="I'm here" onPress={() => s.setManualArrived(true)} />
                    </View>
                  </View>
                  <View className="flex-row gap-2">
                    {s.index > 0 ? (
                      <Pressable
                        onPress={() => setConfirm({ i: s.index, action: "back" })}
                        accessibilityRole="button"
                        accessibilityLabel="Back to previous stop"
                        className="border-paper-line/30 items-center justify-center rounded-xl border px-4 py-2"
                      >
                        <SkipBackIcon size={18} color="#b9b8ac" />
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => setConfirm({ i: s.index, action: "skip" })}
                      accessibilityRole="button"
                      accessibilityLabel="Skip this stop"
                      className="border-paper-line/30 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-4 py-2"
                    >
                      <SkipForwardIcon size={18} color="#b9b8ac" />
                      <Text className="text-cream-dim text-sm font-semibold">Skip</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <Text className="text-cream-dim">Waiting for GPS…</Text>
          )}

          {s.lastSaved ? (
            <View className="flex-row items-center gap-2">
              <CheckCircleIcon size={16} color="#4ade80" />
              <Text className="flex-1 text-sm text-green-300">Saved · {s.lastSaved.summary}</Text>
            </View>
          ) : null}
          {s.err ? <Text className="text-red-400">{s.err}</Text> : null}
        </View>
      </SafeArea>

      {/* Point sheet for any tapped marker — routed, added, or off-route pool.
          Recording the current target advances the run; recording any other
          point saves it and stays put (core recordFor behavior). */}
      <BottomSheet isPresented={selectedId != null} onDismiss={() => setSelectedId(null)}>
        <RNHostView matchContents>
          <View style={{ width: winW - 32 }}>
            {selectedNode ? (
              <PointSheet
                fountain={selectedNode}
                edit={edits[selectedNode.id]}
                onAction={(action, extras) => s.recordFor(selectedNode, action, extras)}
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
