import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ArrowCounterClockwiseIcon } from "phosphor-react-native";
import { usePlanner, removedOf } from "@rosm/core/stores/planner";
import type { Fountain } from "@rosm/core/schemas";
import { fmtDist } from "@rosm/core/geo";
import { Button } from "../ui/Button";
import { PhaseNav } from "./PhaseNav";

function markLabel(f: Fountain) {
  return f.tags.name ?? "Unnamed fountain";
}

// Map phase bottom card: point-picking, route summary, reverse direction, and
// the start-run handoff.
export function RouteBuilderPanel({ onStartRun }: { onStartRun: () => void }) {
  const p = usePlanner();

  const removed = useMemo(
    () => removedOf(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fountains, p.excludedIds],
  );

  const hasSelectedFountains = p.stops.length > 0 || p.pinnedIds.length > 0;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Text className="text-ink text-lg font-bold">Pick fountains to visit</Text>
      </View>

      {removed.length > 0 ? (
        <View className="gap-1">
          <Text className="text-ink-dim text-xs font-semibold">
            Removed from route ({removed.length})
          </Text>
          <ScrollView className="max-h-24">
            {removed.map((f) => (
              <View
                key={f.id}
                className="bg-paper-deep mb-1 flex-row items-center justify-between rounded-lg px-2 py-1.5"
              >
                <Text className="text-ink-dim flex-1 text-xs line-through" numberOfLines={1}>
                  {markLabel(f)}
                </Text>
                <Pressable
                  onPress={() => p.restoreStop(f.id)}
                  accessibilityRole="button"
                  accessibilityLabel="add point back to route"
                >
                  <Text className="text-sky-deep text-xs font-semibold">Add back</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {p.stops.length > 0 ? (
        <View className="border-sky-deep/30 bg-sky/10 gap-2 rounded-2xl border p-3">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-ink font-semibold">{p.stops.length} stops</Text>
            <Text className="text-sky-deep font-semibold">{fmtDist(p.distanceM)}</Text>
          </View>
          {p.autoCount > 0 ? (
            <Text className="text-ink-dim text-xs">
              {p.autoCount} {p.autoCount === 1 ? "was" : "were"} added as a small detour, but you
              can remove any you don’t want.
            </Text>
          ) : null}
          {p.stops.length > 1 ? (
            <Button
              title={p.busy === "reverse" ? "Reversing…" : "Reverse Direction"}
              variant="secondary"
              icon={<ArrowCounterClockwiseIcon size={18} color="#0c0d0a" weight="bold" />}
              disabled={p.busy !== null}
              onPress={() => p.reverseRoute()}
            />
          ) : null}
        </View>
      ) : (
        <Text className="text-ink-dim text-xs">
          Tap points on the map to add them to your route.
        </Text>
      )}

      {p.err ? (
        <View className="gap-2">
          <Text className="text-sm text-red-500">{p.err}</Text>
          {p.islandPt ? (
            <Text className="text-ink-dim text-xs">
              It’s marked ! in red on the map. Remove that point (or move your nearest waypoint),
              then the route re-plans on its own.
            </Text>
          ) : null}
          {p.errRetryable ? (
            <Button
              title="Retry"
              variant="secondary"
              loading={p.busy === "find"}
              onPress={() => p.findPoints()}
            />
          ) : null}
        </View>
      ) : null}

      {/* Back to setup; forward starts the run once a route exists. */}
      <PhaseNav
        back={{ label: "Setup", onPress: () => p.setPhase("config") }}
        forward={{
          label: "Start run",
          onPress: onStartRun,
          disabled: !hasSelectedFountains || p.busy !== null,
        }}
      />
    </View>
  );
}
