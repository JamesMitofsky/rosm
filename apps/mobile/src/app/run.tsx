import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { BottomSheet, RNHostView } from "@expo/ui";
import { CheckCircleIcon, SkipBackIcon, SkipForwardIcon, XCircleIcon } from "phosphor-react-native";
import { DogIcon } from "../components/icons/DogIcon";
import { fmtDist } from "@rosm/core/geo";
import { useOutbox } from "@rosm/core/stores/outbox";
import { RosmMap } from "../map/RosmMap";
import { useRunSession } from "../run/useRunSession";
import { PointSheet } from "../components/PointSheet";
import { Button } from "../components/ui/Button";

function checkedAgoLabel(tags?: Record<string, string>, now: Date = new Date()): string {
  const d = tags?.check_date ?? tags?.["check_date:drinking_water"];
  if (!d) return "Not surveyed yet";
  const diffMs = now.getTime() - new Date(d).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Checked today";
  if (days === 1) return "Checked yesterday";
  if (days < 30) return `Checked ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months === 1) return "Checked 1 month ago";
  return `Checked ${months} months ago`;
}

function maneuver(deg: number): string {
  const norm = ((deg % 360) + 360) % 360;
  if (norm < 20 || norm > 340) return "Continue straight";
  if (norm <= 45) return "Slight right";
  if (norm <= 135) return "Turn right";
  if (norm <= 160) return "Sharp right";
  if (norm <= 200) return "U-turn";
  if (norm <= 225) return "Sharp left";
  if (norm <= 315) return "Turn left";
  return "Slight left";
}

export default function RunScreen() {
  const s = useRunSession();
  const { width: winW } = useWindowDimensions();

  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [addLocation, setAddLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [confirm, setConfirm] = useState<{ i: number; action: "end" } | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const pending = confirm && confirm.i === s.index ? confirm.action : null;

  const onMarkerPress = (id: number | string) => {
    setSelectedId(id);
  };

  const onMapPress = (lat: number, lon: number) => {
    setAddLocation({ lat, lon });
  };

  const selectedPoint = useMemo(() => {
    if (selectedId == null) return null;
    return (
      s.stops.find((st) => st.id === selectedId) ??
      s.added.find((a) => a.id === selectedId) ??
      s.pool.find((p) => p.id === selectedId) ??
      null
    );
  }, [selectedId, s.stops, s.added, s.pool]);

  const selectedEdit = useMemo(() => {
    if (selectedId == null) return undefined;
    const items = useOutbox.getState().items;
    const it = items.find((x) => String(x.nodeId) === String(selectedId));
    if (!it) return undefined;
    return {
      status: it.action,
      summary: it.summary,
      syncState: it.syncState,
      changesetUrl: it.changesetUrl,
      extras: it.extras,
    };
  }, [selectedId]);

  const mapMarkers = useMemo(() => {
    if (!addLocation) return s.markers;
    return [
      ...s.markers,
      {
        id: "pending-add",
        lat: addLocation.lat,
        lon: addLocation.lon,
        color: "#16a34a",
        label: "+",
      },
    ];
  }, [s.markers, addLocation]);

  if (s.hydrating) {
    return (
      <View className="bg-base flex-1 items-center justify-center">
        <Text className="text-light font-medium">Loading session…</Text>
      </View>
    );
  }

  return (
    <View className="bg-base flex-1">
      <RosmMap
        center={s.center}
        bearing={s.mapBearing ?? undefined}
        markers={mapMarkers}
        line={s.line}
        userPos={s.userPos}
        recenterKey={s.recenterKey}
        fitPoints={s.fitPoints}
        onMarkerPress={onMarkerPress}
        onMapPress={onMapPress}
      />
      <View className="bg-base border-light/10 absolute right-0 bottom-0 left-0 border-t px-5 pt-5 pb-8">
        {s.done ? (
          <>
            <Text className="text-light text-lg font-bold">All points surveyed</Text>
            <Button title="Finish run" onPress={s.finish} loading={s.finishing} />
          </>
        ) : s.target ? (
          <>
            <Text className="text-light text-lg font-bold">
              {s.target.tags?.name ??
                (s.nextTurn
                  ? `${maneuver(s.nextTurn.angle)} in ${fmtDist(s.distToTurn ?? 0)}`
                  : "Next stop")}
            </Text>
            <Text className="text-light-muted">{checkedAgoLabel(s.target.tags, now)}</Text>

            {s.target.tags?.drinking_water === "no" ? (
              <View className="flex-row items-center gap-1.5">
                <DogIcon size={16} color="#a78bfa" />
                <Text className="text-sm font-medium text-violet-400">
                  Dog water — not for humans
                </Text>
              </View>
            ) : null}

            {s.osm && !s.osm.loggedIn ? (
              <Text className="text-light-muted text-xs">
                Sign in (Profile tab) to record updates.
              </Text>
            ) : null}

            {pending === "end" ? (
              <View className="gap-2">
                <Text className="text-light text-sm font-medium">
                  End this route early? Remaining stops will be left for next time.
                </Text>
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button title="Cancel" variant="ghost-dark" onPress={() => setConfirm(null)} />
                  </View>
                  <View className="flex-1">
                    <Button
                      title="End route"
                      onPress={() => {
                        setConfirm(null);
                        s.endEarly();
                      }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View className="gap-6 pt-5 pb-3">
                <Button
                  title="I'm here"
                  variant="blue"
                  onPress={() => {
                    s.setManualArrived(true);
                    if (s.target) setSelectedId(s.target.id);
                  }}
                />
                <View className="flex-row gap-3">
                  <Pressable
                    onPress={() => setConfirm({ i: s.index, action: "end" })}
                    accessibilityRole="button"
                    accessibilityLabel="End route early"
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-red-400/40 bg-red-950/20 px-3 py-2.5"
                  >
                    <XCircleIcon size={18} color="#f87171" />
                    <Text className="text-sm font-bold text-red-400">End</Text>
                  </Pressable>
                  {s.index > 0 ? (
                    <Pressable
                      onPress={() => s.goBack()}
                      accessibilityRole="button"
                      accessibilityLabel="Back to previous stop"
                      className="border-light/25 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5"
                    >
                      <SkipBackIcon size={18} color="#f7f2e8" />
                      <Text className="text-light text-sm font-semibold">Back</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => s.skip()}
                    accessibilityRole="button"
                    accessibilityLabel="Skip this stop"
                    className="border-light/25 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5"
                  >
                    <SkipForwardIcon size={18} color="#f7f2e8" />
                    <Text className="text-light text-sm font-semibold">Skip</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        ) : (
          <Text className="text-light-muted">Waiting for GPS…</Text>
        )}

        {s.lastSaved ? (
          <View className="flex-row items-center gap-2">
            <CheckCircleIcon size={16} color="#4ade80" />
            <Text className="flex-1 text-sm text-green-300">Saved · {s.lastSaved.summary}</Text>
          </View>
        ) : null}
        {s.err ? <Text className="text-red-400">{s.err}</Text> : null}
      </View>

      <BottomSheet isPresented={selectedId != null} onDismiss={() => setSelectedId(null)}>
        <RNHostView matchContents>
          <View style={{ width: winW - 32 }}>
            {selectedPoint ? (
              <PointSheet
                fountain={selectedPoint}
                edit={selectedEdit}
                onAction={(action, extras) => {
                  s.recordFor(selectedPoint, action, extras);
                  setSelectedId(null);
                }}
              />
            ) : null}
          </View>
        </RNHostView>
      </BottomSheet>

      <BottomSheet isPresented={addLocation != null} onDismiss={() => setAddLocation(null)}>
        <RNHostView matchContents>
          <View style={{ width: winW - 32 }}>
            {addLocation ? (
              <PointSheet
                fountain={{
                  id: -1,
                  lat: addLocation.lat,
                  lon: addLocation.lon,
                  tags: { amenity: "drinking_water" },
                }}
                onAction={async (_action, extras) => {
                  const loc = addLocation;
                  setAddLocation(null);
                  await s.addAt(loc, extras);
                }}
              />
            ) : null}
          </View>
        </RNHostView>
      </BottomSheet>
    </View>
  );
}
