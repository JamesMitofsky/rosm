import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { getArchivedRoutes } from "@rosm/core/routeArchive";
import { useOsmStatus } from "../auth/useOsmStatus";
import { signOutOsm } from "../auth/osmAuth";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";

const surveyedCount = (stops: { status: string }[]) =>
  stops.filter((s) => s.status !== "pending" && s.status !== "skipped").length;

// Connected hub: account state, primary actions, and run history — all from the
// on-device archive + the server status.
export default function Hub() {
  const router = useRouter();
  const { status } = useOsmStatus();
  const routes = getArchivedRoutes();
  const totalSurveyed = routes.reduce((n, r) => n + surveyedCount(r.plan.stops), 0);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <ScrollView contentContainerClassName="gap-4 p-5">
        <Text className="text-3xl font-bold text-ink">ROSM</Text>

        <Panel>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-lg font-bold text-ink">
                {status?.loggedIn ? "Connected to OSM" : "Not connected"}
              </Text>
              {status && !status.live ? (
                <Text className="text-xs font-semibold text-amber-600">Sandbox</Text>
              ) : null}
            </View>
            {status?.loggedIn ? (
              <Pressable onPress={() => signOutOsm()}>
                <Text className="text-ink-dim">Sign out</Text>
              </Pressable>
            ) : null}
          </View>
        </Panel>

        <Button title="Plan a route" onPress={() => router.push("/plan")} />
        <Button
          title="Quick update nearby"
          variant="secondary"
          onPress={() => router.push("/quick-update")}
        />

        <Panel>
          <Text className="mb-1 font-bold text-ink">Your runs</Text>
          <Text className="mb-3 text-sm text-ink-dim">
            {routes.length} {routes.length === 1 ? "run" : "runs"} · {totalSurveyed} points surveyed
          </Text>
          {routes.length === 0 ? (
            <Text className="text-sm text-ink-dim">No runs yet — plan your first route.</Text>
          ) : (
            routes.slice(0, 10).map((r) => (
              <Pressable
                key={r.routeId}
                onPress={() => router.push({ pathname: "/run-detail", params: { id: r.routeId } })}
                className="border-t border-paper-line py-2.5"
              >
                <Text className="text-ink">
                  {new Date(r.updatedAt).toLocaleDateString()} ·{" "}
                  {(r.plan.distanceM / 1000).toFixed(1)} km · {r.plan.stops.length} stops
                </Text>
              </Pressable>
            ))
          )}
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}
