import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { ArrowCounterClockwiseIcon } from "phosphor-react-native/src/icons/ArrowCounterClockwise";
import { usePlanner, removedOf } from "@water-run/core/stores/planner";
import type { Fountain } from "@water-run/core/schemas";
import { fmtDist } from "@water-run/core/geo";
import { startRunBlocker } from "@water-run/core/startRunGate";
import { Button } from "../ui/Button";

function markLabel(f: Fountain) {
  return f.tags.name ?? "Unnamed fountain";
}

// Map phase bottom card: point-picking, route summary, reverse direction, and
// the start-run handoff, the panel's one prominent button (HIG: Buttons).
export function RouteBuilderPanel({ onStartRun }: { onStartRun: () => void }) {
  const p = usePlanner();

  const removed = useMemo(
    () => removedOf(p),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.fountains, p.excludedIds],
  );

  const hasSelectedFountains = p.stops.length > 0 || p.pinnedIds.length > 0;
  const blocker = startRunBlocker({
    hasSelectedFountains,
    busy: p.busy,
    routeStale: p.routeStale,
    hasError: !!p.err,
  });

  // Retry re-runs whatever failed. A route that failed is re-planned from the
  // current picks; searching again would throw them away.
  const retry =
    p.errSource === "route"
      ? { loading: p.busy === "route", run: () => p.retryRoute() }
      : { loading: p.busy === "find", run: () => p.findPoints() };

  return (
    <View className="gap-3">
      {/* With no start yet (location denied, or no fix so far), touching and
          holding the map sets one; with one, it routes through that spot.
          Touch and hold, so a stray tap or a pan never does either. */}
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-base text-lg font-bold">
          {p.center ? "Pick your fountains" : "Set your start"}
        </Text>
        <Text className="text-muted text-sm">
          {p.center
            ? "Tap a fountain to add or remove it. Touch and hold the map to route through a spot."
            : "Touch and hold the map where your run starts."}
        </Text>
      </View>

      {/* The points came from data hours old (see dataAgeNotice). */}
      {p.pointsNotice ? <Text className="text-muted text-sm">{p.pointsNotice}</Text> : null}

      {removed.length > 0 ? (
        <View className="gap-1">
          <Text className="text-muted text-sm font-semibold">
            Removed from route ({removed.length})
          </Text>
          <ScrollView className="max-h-24">
            {removed.map((f) => (
              <View
                key={f.id}
                className="bg-surface-deep mb-1 flex-row items-center justify-between rounded-lg py-0.5 pl-2"
              >
                <Text className="text-muted flex-1 text-sm line-through" numberOfLines={1}>
                  {markLabel(f)}
                </Text>
                {/* Neighbouring targets end up 8pt apart, too close for a big
                    hitSlop, so this one grows with padding (which also supplies
                    the row's right inset) and takes half that gap as slop. */}
                <Pressable
                  onPress={() => p.restoreStop(f.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${markLabel(f)} back to the route`}
                  hitSlop={{ top: 4, bottom: 4 }}
                  className="px-2 py-2"
                >
                  <Text className="text-action text-sm font-bold">Add Back</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {p.stops.length > 0 ? (
        <View className="border-link/30 bg-info/10 gap-2 rounded-2xl border p-3">
          <View className="flex-row items-baseline justify-between">
            <Text className="text-base font-semibold">{p.stops.length} stops</Text>
            <Text className="text-action font-bold">{fmtDist(p.distanceM)}</Text>
          </View>
          {p.autoCount > 0 ? (
            <Text className="text-muted text-sm">
              Fountains in purple were added along your route and change as your picks do.
            </Text>
          ) : null}
          {p.stops.length > 1 ? (
            <Button
              title={p.busy === "reverse" ? "Reversing…" : "Reverse Direction"}
              accessibilityHint="Runs the same route the other way round"
              variant="secondary"
              icon={<ArrowCounterClockwiseIcon size={18} color="#0c0d0a" weight="bold" />}
              disabled={p.busy !== null}
              onPress={() => p.reverseRoute()}
            />
          ) : null}
        </View>
      ) : null}

      {p.err ? (
        <View className="gap-2">
          <Text className="text-callout text-red-700">{p.err}</Text>
          {p.islandPt ? (
            <Text className="text-muted text-sm">
              It’s marked ! in red on the map. Remove that point (or move your nearest waypoint),
              then the route re-plans on its own.
            </Text>
          ) : null}
          {p.errRetryable ? (
            <Button title="Retry" variant="secondary" loading={retry.loading} onPress={retry.run} />
          ) : null}
        </View>
      ) : null}

      {/* Starts the run once a route exists, and only from a route that
          matches the picks: while it is re-planning, or after that failed,
          the stops and line on hand are the previous route's. While it
          can't, the line under it says why. */}
      <View className="gap-1.5 pt-1">
        <Button
          title="Start Run"
          variant="action"
          onPress={onStartRun}
          disabled={blocker !== null}
          accessibilityHint={blocker ?? undefined}
        />
        {blocker ? (
          <Text className="text-muted text-center text-sm" accessibilityElementsHidden>
            {blocker}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
