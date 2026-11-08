import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  activityBackgroundTint,
  font,
  foregroundStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";
import type { RunActivityState } from "@water-run/core/ports";

// The run's Live Activity: the next stop, how far it is and the next turn, on
// the Lock Screen and in the Dynamic Island. ports/liveActivity starts, updates
// and ends it.
//
// The 'widget' directive compiles this function into its own bundle, which the
// widget extension runs with @expo/ui's SwiftUI components and modifiers as
// globals. So it can use only those, under the names they're imported by, and
// whatever is declared inside it: nothing else from this file or the app.
//
// The compact and minimal views always fit the 28 pt circle of the Dynamic
// Island's limited-width presentations (HIG: Live Activities), since
// expo-widgets doesn't say when one is showing: an icon on the leading side
// and the distance stacked as "0.3" over "mi" on the trailing side.
function RunProgress(props: RunActivityState, env: LiveActivityEnvironment) {
  "widget";
  // The app's palette: the blue accent (appConfig's colors.accent, which the
  // widget bundle can't import) on its near-black base. Always-On (reduced
  // luminance) gets white, which stays legible when the screen dims.
  const ink = "#eef2f6";
  const dim = "#8fa3b3";
  const accent = env.isLuminanceReduced ? "#ffffff" : "#4fafd4";
  // Stale: the app hasn't updated the activity in a while (suspended or
  // killed), so the figures may be out of date.
  const figure = env.isStale ? dim : ink;
  const where = `${props.stopDist} to ${props.stopName}`;
  const turnIcon =
    props.turnSide === "left"
      ? "arrow.turn.up.left"
      : props.turnSide === "right"
        ? "arrow.turn.up.right"
        : "arrow.up";
  const turnLine = props.turn ? `Next: ${props.turn}` : "No more turns";
  const stopOf = `Stop ${props.stopNumber} of ${props.totalStops}`;

  // The distance as a stacked figure and unit, sized to the space it gets.
  const stacked = (valueSize: number, unitSize: number, color: string) => (
    <VStack spacing={0} modifiers={[accessibilityLabel(where)]}>
      <Text
        modifiers={[
          font({ size: valueSize, weight: "semibold", design: "rounded" }),
          monospacedDigit(),
          foregroundStyle(color),
          lineLimit(1),
          minimumScaleFactor(0.6),
        ]}
      >
        {props.stopDistValue}
      </Text>
      <Text
        modifiers={[
          font({ size: unitSize, weight: "medium", design: "rounded" }),
          foregroundStyle(dim),
          lineLimit(1),
        ]}
      >
        {props.stopDistUnit}
      </Text>
    </VStack>
  );
  const drop = (size: number) => (
    <Image systemName="drop.fill" size={size} color={accent} modifiers={[accessibilityHidden()]} />
  );
  const turnRow = (
    <HStack spacing={6} modifiers={[accessibilityLabel(turnLine)]}>
      <Image systemName={turnIcon} size={15} color={accent} />
      <Text modifiers={[font({ textStyle: "subheadline" }), foregroundStyle(figure), lineLimit(1)]}>
        {turnLine}
      </Text>
    </HStack>
  );

  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 }), activityBackgroundTint("#0c0d0a")]}>
        {drop(22)}
        <VStack alignment="leading" spacing={4}>
          <Text
            modifiers={[
              font({ textStyle: "headline" }),
              foregroundStyle(ink),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}
          >
            {props.stopName}
          </Text>
          {turnRow}
          <Text modifiers={[font({ textStyle: "caption" }), foregroundStyle(dim)]}>
            {env.isStale ? "Open Water Run to update" : stopOf}
          </Text>
        </VStack>
        <Spacer />
        {stacked(28, 13, figure)}
      </HStack>
    ),
    // Apple Watch's Smart Stack and CarPlay: just the stop and its distance.
    bannerSmall: (
      <HStack spacing={8} modifiers={[padding({ all: 8 })]}>
        {drop(14)}
        <Text modifiers={[font({ textStyle: "headline" }), foregroundStyle(ink), lineLimit(1)]}>
          {props.stopName}
        </Text>
        <Spacer />
        {stacked(17, 10, figure)}
      </HStack>
    ),
    compactLeading: drop(15),
    compactTrailing: stacked(13, 9, figure),
    minimal: stacked(13, 9, accent),
    expandedLeading: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ leading: 4 })]}>
        {drop(20)}
        <Text modifiers={[font({ textStyle: "caption" }), foregroundStyle(dim), lineLimit(1)]}>
          {stopOf}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" modifiers={[padding({ trailing: 4 })]}>
        {stacked(24, 12, figure)}
      </VStack>
    ),
    expandedCenter: (
      <Text
        modifiers={[
          font({ textStyle: "headline" }),
          foregroundStyle(ink),
          lineLimit(1),
          minimumScaleFactor(0.8),
        ]}
      >
        {props.stopName}
      </Text>
    ),
    expandedBottom: turnRow,
  };
}

export default createLiveActivity("RunProgress", RunProgress);
