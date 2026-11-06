import { useEffect, useRef } from "react";
import { useWindowDimensions, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import { reduceMotionNow, useReduceMotion } from "./accessibility";

// celebratePoint() is the CelebratePort the screens fire; ConfettiHost is mounted
// once in the root layout and listens for it, firing its cannon.
//
// With Reduce Motion on there is no confetti at all (HIG: Accessibility, Motion):
// the haptic and the on-screen confirmation that go with every celebration carry
// the news without it.
const listeners = new Set<() => void>();

export function celebratePoint(): void {
  if (reduceMotionNow()) return;
  listeners.forEach((l) => l());
}

export function ConfettiHost() {
  const ref = useRef<ConfettiCannon>(null);
  const { width } = useWindowDimensions();
  // Subscribing keeps the shared value current while the app runs.
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    const fire = () => ref.current?.start();
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
    };
  }, []);
  if (reduceMotion) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Keyed on width so the cannon re-aims from the middle after a resize. */}
      <ConfettiCannon
        key={width}
        ref={ref}
        count={60}
        origin={{ x: width / 2, y: -20 }}
        autoStart={false}
        fadeOut
      />
    </View>
  );
}
