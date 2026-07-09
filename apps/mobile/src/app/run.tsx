import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRunSession } from "../run/useRunSession";
import { RosmMap } from "../map/RosmMap";
import { Button } from "../components/ui/Button";

// Standalone run: live HUD over the shared map, driven by the run session hook.
// Recovers an interrupted run from the archive on cold start.
export default function Run() {
  const router = useRouter();
  const s = useRunSession({ enabled: true });

  if (s.closed) {
    const surveyed = s.stops.filter((x) => x.status !== "pending" && x.status !== "skipped").length;
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-ink px-6">
        <Text className="text-2xl font-bold text-cream">Run complete</Text>
        <Text className="text-cream-dim">
          You surveyed {surveyed} {surveyed === 1 ? "point" : "points"}. Nice work!
        </Text>
        <Button
          title="Back to hub"
          onPress={() => {
            s.reset();
            router.replace("/");
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-ink">
      <RosmMap
        center={s.center}
        markers={s.markers}
        line={s.line}
        userPos={s.userPos}
        recenterKey={s.recenterKey}
        fitPoints={s.fitPoints}
      />
      <SafeAreaView edges={["bottom"]} className="absolute bottom-0 left-0 right-0 p-4">
        <View className="gap-3 rounded-2xl bg-ink-soft p-4">
          {s.done ? (
            <>
              <Text className="text-lg font-bold text-cream">All points surveyed</Text>
              <Button title="Finish & close changeset" onPress={s.finish} loading={s.finishing} />
            </>
          ) : s.target ? (
            <>
              <Text className="text-lg font-bold text-cream">
                {s.target.tags?.name ?? `Node ${s.target.id}`}
              </Text>
              <Text className="text-cream-dim">
                {s.distToTarget != null
                  ? `${Math.round(s.distToTarget)} m ${s.heading}`
                  : "Locating…"}
                {s.nextTurn ? ` · turn in ${Math.round(s.distToTurn ?? 0)} m` : ""}
              </Text>
              {s.arrived ? (
                <View className="flex-row flex-wrap gap-2">
                  <Button title="Working" onPress={() => s.record("confirm")} />
                  <Button
                    title="Out of order"
                    variant="secondary"
                    onPress={() => s.record("out_of_order")}
                  />
                  <Button title="Removed" variant="secondary" onPress={() => s.record("removed")} />
                  <Button title="Skip" variant="ghost" onPress={s.skip} />
                </View>
              ) : (
                <View className="flex-row gap-2">
                  <Button title="I'm here" onPress={() => s.setManualArrived(true)} />
                  <Button title="Skip" variant="ghost" onPress={s.skip} />
                </View>
              )}
            </>
          ) : (
            <Text className="text-cream-dim">Waiting for GPS…</Text>
          )}
          {s.err ? <Text className="text-red-400">{s.err}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}
