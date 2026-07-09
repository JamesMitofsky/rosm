import { useEffect, useRef } from "react";
import { View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";

// celebratePoint() is the CelebratePort the run hook fires; ConfettiHost is mounted
// once in the root layout and listens for it, firing its cannon.
const listeners = new Set<() => void>();

export function celebratePoint(): void {
  listeners.forEach((l) => l());
}

export function ConfettiHost() {
  const ref = useRef<ConfettiCannon>(null);
  useEffect(() => {
    const fire = () => ref.current?.start();
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
    };
  }, []);
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <ConfettiCannon ref={ref} count={60} origin={{ x: 180, y: -20 }} autoStart={false} fadeOut />
    </View>
  );
}
