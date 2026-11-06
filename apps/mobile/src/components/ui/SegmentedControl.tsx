import { Pressable, Text, View } from "react-native";
import { hapticSelect } from "../../ports/haptics";

// Mutually exclusive options drawn after iOS's segmented control: a grey track
// with the chosen segment raised on it. Text only, equal widths, a selection
// tick (HIG: Segmented controls: "Prefer using either text or images — not a
// mix of both"). VoiceOver hears each segment's place ("Both, 2 of 3") as it
// does on the system control.
export function SegmentedControl<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  // What the choice is about, shown above the control.
  label?: string;
}) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text
          accessibilityRole="header"
          className="text-muted text-xs font-bold tracking-wider uppercase"
        >
          {label}
        </Text>
      ) : null}
      <View className="bg-surface-deep flex-row rounded-xl p-0.5">
        {options.map((o, i) => {
          const selected = value === o.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${o.label}, ${i + 1} of ${options.length}`}
              onPress={() => {
                if (selected) return;
                hapticSelect();
                onChange(o.key);
              }}
              className={`min-h-11 flex-1 items-center justify-center rounded-[10px] px-1 py-2 ${
                selected ? "bg-white shadow-sm shadow-black/15" : "active:opacity-60"
              }`}
            >
              <Text
                className={`text-center text-sm ${
                  selected ? "text-base font-semibold" : "text-base font-medium"
                }`}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
