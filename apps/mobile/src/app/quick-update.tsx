import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Fountain, EditAction } from "@rosm/core/schemas";
import { milesToMeters, haversine, boundsCenter, boundsRadiusM, type Pt } from "@rosm/core/geo";
import { useOutbox } from "@rosm/core/stores/outbox";
import { EDIT_COLOR } from "@rosm/core/editStatus";
import { api } from "../ports/api";
import { geolocation } from "../ports/geolocation";
import { celebratePoint } from "../ports/confetti";
import { hapticSuccess } from "../ports/haptics";
import { RosmMap, type RosmMarker, type RosmRegion } from "../map/RosmMap";
import { Button } from "../components/ui/Button";

const TAG = { key: "amenity", value: "drinking_water" };
const RADIUS_MI = 0.3;
// Cap the queried area so a fully zoomed-out map can't fire a huge Overpass query.
const MAX_RADIUS_M = milesToMeters(25);
// The map must drift this far past the last search (as a fraction of that
// search's radius) before "Search this area" appears — stops it flickering on
// every idle settle.
const REQUERY_FRACTION = 0.3;

type Search = { center: Pt; radiusM: number };

// True once the viewport has panned/zoomed far enough from the last search that
// re-querying would surface different fountains.
function movedEnough(region: RosmRegion, last: Search): boolean {
  const c = boundsCenter(region.bounds);
  const r = Math.min(boundsRadiusM(region.bounds), MAX_RADIUS_M);
  const panned = haversine(c, last.center) > last.radiusM * REQUERY_FRACTION;
  const resized = Math.abs(r - last.radiusM) > last.radiusM * REQUERY_FRACTION;
  return panned || resized;
}

// Locate → show nearby fountains → tap one → record its state to OSM (offline-first
// via the outbox). Pan/zoom the map, then "Search this area" re-queries the visible
// viewport — so zooming out searches a wider region. No routing.
export default function QuickUpdate() {
  const router = useRouter();
  const [center, setCenter] = useState<Pt | null>(null);
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [edited, setEdited] = useState<Record<number, EditAction>>({});
  const [selected, setSelected] = useState<Fountain | null>(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Where/how wide the current markers were fetched, and the live viewport.
  const [lastSearch, setLastSearch] = useState<Search | null>(null);
  const [region, setRegion] = useState<RosmRegion | null>(null);

  const search = useCallback(async ({ center: c, radiusM }: Search) => {
    const capped = Math.min(radiusM, MAX_RADIUS_M);
    setBusy(true);
    setErr(null);
    setSelected(null);
    try {
      const r = await api.apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: c.lat,
          lon: c.lon,
          radiusM: capped,
          tag: TAG,
          recencyMode: "any",
          includeDisused: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? "Couldn't load fountains.");
      setFountains(j.fountains as Fountain[]);
      setLastSearch({ center: c, radiusM: capped });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const pos = await geolocation.getCurrentPosition();
      setCenter(pos);
      await search({ center: pos, radiusM: milesToMeters(RADIUS_MI) });
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }, [search]);

  useEffect(() => {
    // Fetch-on-mount: load() only setStates after awaits (locate + fetch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Offer a re-query only once the map has moved meaningfully from the results.
  const canRequery =
    !busy && region != null && lastSearch != null && movedEnough(region, lastSearch);

  function requery() {
    if (!region) return;
    search({ center: boundsCenter(region.bounds), radiusM: boundsRadiusM(region.bounds) });
  }

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
        : "#ef4444",
  }));

  return (
    <View className="flex-1 bg-paper">
      {center ? (
        <RosmMap
          center={[center.lat, center.lon]}
          markers={markers}
          userPos={[center.lat, center.lon]}
          initialOnly
          onRegionChange={setRegion}
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

      {center && canRequery && !selected ? (
        <SafeAreaView edges={["top"]} className="absolute left-0 right-0 top-0 items-center p-3">
          <Pressable
            onPress={requery}
            className="rounded-full bg-ink px-5 py-2.5 shadow-lg"
            accessibilityRole="button"
          >
            <Text className="font-semibold text-white">Search this area</Text>
          </Pressable>
        </SafeAreaView>
      ) : null}

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
