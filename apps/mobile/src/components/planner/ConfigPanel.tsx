import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { usePlanner } from "@rosm/core/stores/planner";
import { getLastKnownPosition } from "../../ports/geolocation";
import { Button } from "../ui/Button";
import { PhaseNav } from "./PhaseNav";

// Numeric field → store value: empty/invalid text stays "" so the store keeps
// its `number | ""` shape (same contract as the web inputs).
const toNum = (t: string): number | "" => {
  const n = Number(t);
  return t.trim() === "" || Number.isNaN(n) ? "" : n;
};

// Config phase: the start is our GPS (no "where do you start?" step — we already
// have location), so the only question left is how wide to search. "Find points"
// hands the screen over to the route builder.
export function ConfigPanel() {
  const p = usePlanner();

  // Auto-locate on mount: drop the camera over the user's own position instead of
  // asking. Quick cached fix first (instant jump), then the accurate one-shot
  // refines it once GPS settles. Sequential so the stale fix can't overwrite it.
  useEffect(() => {
    if (usePlanner.getState().center) return;
    (async () => {
      const quick = await getLastKnownPosition();
      if (quick && !usePlanner.getState().center) {
        usePlanner.getState().recenter({ lat: quick.lat, lon: quick.lon });
      }
      usePlanner.getState().geolocate();
    })();
  }, []);

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-ink text-2xl font-bold">How wide should we search?</Text>
      </View>

      <View className="gap-4">
        <View className="flex-row items-center gap-2">
          <TextInput
            className="border-paper-line bg-paper/40 text-ink w-20 rounded-lg border px-2 py-2"
            keyboardType="decimal-pad"
            value={p.radiusMi === "" ? "" : String(p.radiusMi)}
            onChangeText={(t) => p.setRadiusMi(toNum(t))}
          />
          <Text className="text-ink text-sm">mile search radius</Text>
        </View>
      </View>

      {p.err ? (
        <View className="gap-2">
          <Text className="text-red-500">{p.err}</Text>
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

      {/* First view — no back; forward runs the search and hands off to build. */}
      <PhaseNav
        forward={{
          label: "Find points",
          onPress: () => p.finishConfig(),
          disabled: !p.center || p.busy !== null,
          loading: p.busy === "find",
        }}
      />
    </View>
  );
}
