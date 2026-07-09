import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Fountain, EditAction } from "@rosm/core/schemas";
import { milesToMeters, type Pt } from "@rosm/core/geo";
import { useOutbox } from "@rosm/core/stores/outbox";
import { EDIT_COLOR } from "@rosm/core/editStatus";
import { api } from "../ports/api";
import { geolocation } from "../ports/geolocation";
import { celebratePoint } from "../ports/confetti";
import { hapticSuccess } from "../ports/haptics";
import { RosmMap, type RosmMarker } from "../map/RosmMap";
import { Button } from "../components/ui/Button";

const TAG = { key: "amenity", value: "drinking_water" };
const RADIUS_MI = 0.2;

// Locate → show nearby fountains → tap one → record its state to OSM (offline-first
// via the outbox). No routing.
export default function QuickUpdate() {
  const router = useRouter();
  const [center, setCenter] = useState<Pt | null>(null);
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [edited, setEdited] = useState<Record<number, EditAction>>({});
  const [selected, setSelected] = useState<Fountain | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const pos = await geolocation.getCurrentPosition();
      setCenter(pos);
      const r = await api.apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: pos.lat,
          lon: pos.lon,
          radiusM: milesToMeters(RADIUS_MI),
          tag: TAG,
          recencyMode: "any",
          includeDisused: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "Couldn't load fountains.");
      setFountains(j.fountains as Fountain[]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount: load() only setStates after awaits (locate + fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function record(node: Fountain, action: EditAction) {
    useOutbox
      .getState()
      .enqueue({ nodeId: node.id, action, tagKey: TAG.key, name: node.tags?.name });
    setEdited((e) => ({ ...e, [node.id]: action }));
    celebratePoint();
    hapticSuccess();
    setSelected(null);
    useOutbox.getState().flush();
  }

  const markers: RosmMarker[] = fountains.map((f) => ({
    id: f.id,
    lat: f.lat,
    lon: f.lon,
    color: edited[f.id]
      ? (EDIT_COLOR[edited[f.id]] ?? "#16a34a")
      : selected?.id === f.id
        ? "#2563eb"
        : "#9ca3af",
  }));

  return (
    <View className="flex-1 bg-paper">
      {center ? (
        <RosmMap
          center={[center.lat, center.lon]}
          markers={markers}
          userPos={[center.lat, center.lon]}
          recenterKey={`${center.lat},${center.lon}`}
          onMarkerPress={(id) => setSelected(fountains.find((f) => f.id === id) ?? null)}
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text className="text-ink-dim">{busy ? "Finding fountains nearby…" : (err ?? "")}</Text>
        </View>
      )}

      <SafeAreaView edges={["top"]} className="absolute left-0 top-0 p-3">
        <Pressable onPress={() => router.back()} className="rounded-full bg-white/80 px-4 py-2">
          <Text className="font-semibold text-ink">Back</Text>
        </Pressable>
      </SafeAreaView>

      {selected ? (
        <SafeAreaView edges={["bottom"]} className="absolute bottom-0 left-0 right-0 p-4">
          <View className="gap-3 rounded-2xl border border-paper-line bg-white p-4">
            <Text className="text-lg font-bold text-ink">
              {selected.tags?.name ?? `Node ${selected.id}`}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <Button title="Working" onPress={() => record(selected, "confirm")} />
              <Button
                title="Out of order"
                variant="secondary"
                onPress={() => record(selected, "out_of_order")}
              />
              <Button
                title="Removed"
                variant="secondary"
                onPress={() => record(selected, "removed")}
              />
              <Button title="Close" variant="ghost" onPress={() => setSelected(null)} />
            </View>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}
