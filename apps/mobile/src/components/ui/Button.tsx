import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "blue" | "ghost-dark";

type Props = Omit<PressableProps, "children"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
};

const BOX: Record<Variant, string> = {
  primary: "bg-ink",
  secondary: "bg-paper-deep",
  ghost: "bg-transparent border border-paper-line",
  danger: "bg-transparent border border-red-400",
  blue: "bg-sky-deep",
  "ghost-dark": "bg-transparent border border-cream/25",
};

const LABEL: Record<Variant, string> = {
  primary: "text-paper",
  secondary: "text-ink",
  ghost: "text-ink",
  danger: "text-red-500",
  blue: "text-white",
  "ghost-dark": "text-cream",
};

export function Button({ title, variant = "primary", loading, disabled, icon, ...rest }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      className={`flex-row items-center justify-center gap-2 rounded-xl px-5 py-3 ${BOX[variant]} ${
        disabled || loading ? "opacity-50" : ""
      }`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#f7f2e8" : "#0c0d0a"} />
      ) : (
        (icon ?? null)
      )}
      <Text className={`text-base font-bold ${LABEL[variant]}`}>{title}</Text>
    </Pressable>
  );
}
