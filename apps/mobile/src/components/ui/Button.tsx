import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "blue" | "ghost-dark";

type Size = "md" | "lg";

type Props = Omit<PressableProps, "children"> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
};

const BOX: Record<Variant, string> = {
  primary: "bg-base",
  secondary: "bg-surface-deep",
  ghost: "bg-transparent border border-border",
  danger: "bg-transparent border border-red-400",
  blue: "bg-link",
  "ghost-dark": "bg-transparent border border-light/25",
};

const LABEL: Record<Variant, string> = {
  primary: "text-surface",
  secondary: "text-base",
  ghost: "text-base",
  danger: "text-red-500",
  blue: "text-white",
  "ghost-dark": "text-light",
};

const SIZE_BOX: Record<Size, string> = {
  md: "px-5 py-3",
  lg: "px-5 py-6",
};

const SIZE_LABEL: Record<Size, string> = {
  md: "text-base",
  lg: "text-xl",
};

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  ...rest
}: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      className={`flex-row items-center justify-center gap-2 rounded-xl ${SIZE_BOX[size]} ${BOX[variant]} ${
        disabled || loading ? "opacity-50" : ""
      }`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#f7f2e8" : "#0c0d0a"} />
      ) : (
        (icon ?? null)
      )}
      <Text className={`font-bold ${SIZE_LABEL[size]} ${LABEL[variant]}`}>{title}</Text>
    </Pressable>
  );
}
