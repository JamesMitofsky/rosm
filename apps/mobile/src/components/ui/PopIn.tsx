import { useEffect, type ReactNode } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

type Props = {
  children: ReactNode;
  // Off, the children just show: a card for an edit made on an earlier visit
  // has nothing new to announce.
  animate?: boolean;
  // Pops again whenever this changes identity, e.g. each new save.
  trigger?: unknown;
  // Scale it grows from. Lower is springier: a badge can bounce, a card shouldn't.
  from?: number;
  style?: StyleProp<ViewStyle>;
};

const SPRING = { dampingRatio: 0.55, duration: 450 };

// Fades and springs its children in, so a save registers at a glance even when
// nothing celebrates it (see celebratesEdit). Reanimated's default ReduceMotion
// setting skips straight to the end state when the system asks for less motion.
export function PopIn({ children, animate = true, trigger, from = 0.94, style }: Props) {
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    progress.value = withSequence(withTiming(0, { duration: 0 }), withSpring(1, SPRING));
  }, [animate, trigger, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: from + (1 - from) * progress.value }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
