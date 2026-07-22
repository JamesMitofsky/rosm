import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { SafeArea } from "../components/ui/SafeArea";
import { getArchivedRoutes } from "@rosm/core/routeArchive";
import { STATUS_COLOR } from "@rosm/core/editStatus";
import { RosmMap, type RosmMarker } from "../map/RosmMap";
import { fmtDist } from "@rosm/core/geo";
import { Button } from "../components/ui/Button";

// Read-only replay of one archived run — validates the archive schema end-to-end.
export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const route = getArchivedRoutes().find((r) => r.routeId === id);

  if (!route) {
    return (
      <SafeArea className="bg-paper flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-ink">Run not found.</Text>
        <Button title="Back" onPress={() => router.back()} />
      </SafeArea>
    );
  }

  const { plan } = route;
  const markers: RosmMarker[] = plan.stops.map((s, i) => ({
    id: s.id,
    lat: s.lat,
    lon: s.lon,
    color: STATUS_COLOR[s.status],
    label: String(i + 1),
  }));
  const line: [number, number][] = plan.routeCoords.map(([lon, lat]) => [lat, lon]);
  const fit = plan.stops.map((s): [number, number] => [s.lat, s.lon]);

  return (
    <SafeArea className="bg-paper flex-1" edges={["bottom"]}>
      <View className="h-1/2">
        <RosmMap
          center={[plan.start.lat, plan.start.lon]}
          markers={markers}
          line={line}
          fitPoints={fit}
          recenterKey={route.routeId}
        />
      </View>
      <ScrollView contentContainerClassName="gap-2 p-5">
        <Text className="text-ink text-xl font-bold">
          {new Date(route.updatedAt).toLocaleString()}
        </Text>
        <Text className="text-ink-dim">
          {fmtDist(plan.distanceM)} · {plan.stops.length} stops
        </Text>
        {plan.stops.map((s, i) => (
          <Text key={s.id} className="text-ink">
            {i + 1}. {s.tags?.name ?? `node ${s.id}`} — {s.status}
          </Text>
        ))}
        <View className="mt-3">
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeArea>
  );
}
