import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "action" | "ghost-dark";

type Size = "md" | "lg";

type Props = Omit<PressableProps, "children"> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
};

// `action` is the app's prominent style: one per view, for the most likely
// next step (HIG: Buttons). Its blue is the text-safe `action` token, not the
// brand `link`, which white text can't be read on.
const BOX: Record<Variant, string> = {
  primary: "bg-base",
  secondary: "bg-surface-deep",
  ghost: "bg-transparent border border-border",
  danger: "bg-transparent border border-red-400",
  action: "bg-action",
  "ghost-dark": "bg-transparent border border-light/25",
};

const LABEL: Record<Variant, string> = {
  primary: "text-surface",
  secondary: "text-base",
  ghost: "text-base",
  danger: "text-red-500",
  action: "text-white",
  "ghost-dark": "text-light",
};

const SPINNER: Record<Variant, string> = {
  primary: "#f4f6f8",
  secondary: "#0c0d0a",
  ghost: "#0c0d0a",
  danger: "#ef4444",
  action: "#ffffff",
  "ghost-dark": "#eef2f6",
};

const SIZE_BOX: Record<Size, string> = {
  md: "min-h-12 px-5 py-3",
  lg: "px-5 py-6",
};

const SIZE_LABEL: Record<Size, string> = {
  md: "text-body",
  lg: "text-xl",
};

// Capsule-shaped, as iOS 26's standard buttons are, so a full-width button
// near the screen's rounded corners doesn't pinch against them. Every custom
// button needs a press state (HIG: Buttons); `active:` dims it while held.
export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  ...rest
}: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      className={`flex-row items-center justify-center gap-2 rounded-full active:opacity-70 ${
        SIZE_BOX[size]
      } ${BOX[variant]} ${inactive ? "opacity-50" : ""}`}
      {...rest}
    >
      {loading ? <ActivityIndicator color={SPINNER[variant]} /> : (icon ?? null)}
      <Text className={`text-center font-bold ${SIZE_LABEL[size]} ${LABEL[variant]}`}>{title}</Text>
    </Pressable>
  );
}
