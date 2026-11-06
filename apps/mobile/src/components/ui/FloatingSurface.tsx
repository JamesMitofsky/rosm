import type { ReactNode } from "react";
import { Platform, Pressable, View, type PressableProps, type ViewProps } from "react-native";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import { withUniwind } from "uniwind";
import { useReduceTransparency } from "../../ports/accessibility";

// The surface for controls that float over a map: status pills, "Search this
// area", the map buttons. On iOS 26+ it is Liquid Glass, the material Apple
// reserves for the control layer that floats over content (HIG: Materials);
// elsewhere, and whenever Reduce Transparency is on, it is a near-opaque light
// surface with a soft shadow. Content on it uses dark ink in both cases, so a
// caller never has to know which one it got.

// expo-glass-effect isn't a core RN component, so Uniwind needs the wrapper
// for className to reach it.
const StyledGlassView = withUniwind(GlassView);

// Checked once: whether this OS and build render Liquid Glass at all, and
// whether the runtime API exists (some iOS 26 betas lacked it and crashed;
// expo/expo#40911).
const GLASS_SUPPORTED = (() => {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
})();

export function useGlass(): boolean {
  const reduceTransparency = useReduceTransparency();
  return GLASS_SUPPORTED && !reduceTransparency;
}

const FALLBACK = "bg-white/95 shadow-lg shadow-black/20";

type SurfaceProps = ViewProps & {
  className?: string;
  // A surface the user presses: the glass reacts to the touch.
  interactive?: boolean;
  children: ReactNode;
};

export function FloatingSurface({ className, interactive, children, ...rest }: SurfaceProps) {
  const glass = useGlass();
  if (glass) {
    return (
      <StyledGlassView
        glassEffectStyle="regular"
        isInteractive={interactive}
        className={className}
        {...rest}
      >
        {children}
      </StyledGlassView>
    );
  }
  return (
    <View className={`${FALLBACK} ${className ?? ""}`} {...rest}>
      {children}
    </View>
  );
}

type ButtonProps = Omit<PressableProps, "children"> & {
  className?: string;
  children: ReactNode;
};

// A floating control: the surface above, pressable, with a press state on the
// fallback (the glass draws its own).
export function FloatingButton({ className, children, style, ...rest }: ButtonProps) {
  const glass = useGlass();
  return (
    <Pressable accessibilityRole="button" {...rest}>
      {({ pressed }) => (
        <FloatingSurface
          interactive
          className={className}
          style={[!glass && pressed ? { opacity: 0.7 } : null, style as ViewProps["style"]]}
        >
          {children}
        </FloatingSurface>
      )}
    </Pressable>
  );
}
