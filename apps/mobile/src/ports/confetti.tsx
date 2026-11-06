import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import cfg from "@water-run/core/appConfig.json";
import { reduceMotionNow, useReduceMotion } from "./accessibility";

// celebratePoint() is the CelebratePort the app fires for good news (see
// celebratesEdit); ConfettiHost is mounted once in the root layout and listens
// for it, raining confetti down from the top of the screen.
//
// With Reduce Motion on there is no confetti at all (HIG: Accessibility, Motion):
// the haptic and the on-screen confirmation that go with every celebration carry
// the news without it.
const listeners = new Set<() => void>();

export function celebratePoint(): void {
  if (reduceMotionNow()) return;
  listeners.forEach((l) => l());
}

// The brand's lime and water blues. The deep blue isn't a token: it's the link
// blue darkened, so some pieces still read over the pale basemap.
const COLORS = [
  cfg.colors.accent,
  cfg.colors["accent-deep"],
  cfg.colors.link,
  cfg.colors.info,
  "#2b7fae",
];

const PIECES = 56;
// Pieces start falling over this window, so the rain arrives as a shower
// rather than one sheet.
const SPAWN_MS = 700;
// How long one piece takes from above the top edge to below the bottom one.
const FALL_MS = [2200, 3200] as const;
const TOTAL_MS = SPAWN_MS + FALL_MS[1];
// Two showers can overlap (two quick confirms); a third replaces the oldest.
const MAX_BURSTS = 2;

type Piece = {
  x: number;
  delay: number;
  duration: number;
  w: number;
  h: number;
  color: string;
  // Side-to-side drift as it falls, like paper catching the air.
  sway: number;
  swayCycles: number;
  phase: number;
  // Degrees turned over the whole fall, and how often it flips face over.
  spin: number;
  flips: number;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makePieces(width: number): Piece[] {
  return Array.from({ length: PIECES }, () => ({
    x: rand(0, width),
    delay: rand(0, SPAWN_MS),
    duration: rand(FALL_MS[0], FALL_MS[1]),
    w: rand(6, 9),
    h: rand(10, 15),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    sway: rand(10, 32),
    swayCycles: rand(1, 2.5),
    phase: rand(0, Math.PI * 2),
    spin: rand(180, 720) * (Math.random() < 0.5 ? -1 : 1),
    flips: rand(3, 7),
  }));
}

function ConfettiPiece({
  piece,
  clock,
  height,
}: {
  piece: Piece;
  clock: SharedValue<number>;
  height: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (clock.value - piece.delay) / piece.duration));
    // Paper confetti hits its terminal speed almost at once, so it falls at a
    // steady rate; the motion comes from the sway, spin and flip.
    const y = -piece.h * 2 + p * (height + piece.h * 4);
    const x = piece.x + piece.sway * Math.sin(piece.phase + p * piece.swayCycles * Math.PI * 2);
    return {
      opacity: p <= 0 ? 0 : p > 0.8 ? (1 - p) / 0.2 : 1,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${p * piece.spin}deg` },
        // A squash through zero reads as the piece turning face over.
        { scaleY: Math.cos(p * piece.flips * Math.PI * 2) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          width: piece.w,
          height: piece.h,
          borderRadius: 1.5,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}

// One shower. A single clock drives every piece, so the whole burst is one
// animation on the UI thread; it unmounts itself once the last piece is gone.
function ConfettiRain({ id, onDone }: { id: number; onDone: (id: number) => void }) {
  const { width, height } = useWindowDimensions();
  // Placed once per shower: a rotation mid-fall shouldn't reshuffle it.
  const [pieces] = useState(() => makePieces(width));
  const clock = useSharedValue(0);

  useEffect(() => {
    clock.value = withTiming(TOTAL_MS, { duration: TOTAL_MS, easing: Easing.linear });
    const t = setTimeout(() => onDone(id), TOTAL_MS);
    return () => clearTimeout(t);
  }, [clock, id, onDone]);

  return pieces.map((piece, i) => (
    <ConfettiPiece key={i} piece={piece} clock={clock} height={height} />
  ));
}

export function ConfettiHost() {
  const [bursts, setBursts] = useState<number[]>([]);
  const nextId = useRef(0);
  // Followed live, so turning Reduce Motion on mid-shower clears it at once.
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    const fire = () => setBursts((b) => [...b, nextId.current++].slice(-MAX_BURSTS));
    listeners.add(fire);
    return () => {
      listeners.delete(fire);
    };
  }, []);

  const done = useCallback((id: number) => setBursts((b) => b.filter((x) => x !== id)), []);

  if (reduceMotion || bursts.length === 0) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}
    >
      {bursts.map((id) => (
        <ConfettiRain key={id} id={id} onDone={done} />
      ))}
    </View>
  );
}
