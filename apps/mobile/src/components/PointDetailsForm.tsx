import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { SnowflakeIcon } from "phosphor-react-native/src/icons/Snowflake";
import type { Audience, Dispenser, EditExtras } from "@water-run/core/schemas";
import { hasQuickTag, NOTE_MAX, toggleQuickTag } from "@water-run/core/note";
import { surveyExtras, surveyFormDefaults, type SurveyKind } from "@water-run/core/surveyDefaults";
import { AudienceToggle } from "./AudienceToggle";
import { DispenserToggle } from "./DispenserToggle";
import { TextField } from "./ui/TextField";
import { hapticSelect } from "../ports/haptics";

const QUICK_TAGS = [
  "Not draining",
  "Low water pressure",
  "One fountain not running",
  "Bottle filler not running",
];

// The color of a filled button's label and icon. Light (white) on the
// saturated fills; dark on a light fill such as amber, where white falls
// under 3:1 contrast.
export type Ink = "light" | "dark";
export const INK: Record<Ink, { text: string; hex: string }> = {
  light: { text: "text-white", hex: "#ffffff" },
  dark: { text: "text-base", hex: "#0c0d0a" },
};

type Props = {
  kind: SurveyKind;
  tags: Record<string, string>;
  submitLabel: string;
  SubmitIcon?: typeof CheckCircleIcon;
  submitBox?: string;
  submitInk?: Ink;
  onSubmit: (extras?: EditExtras) => void;
};

// The details behind a survey answer, prefilled with what the node already
// records (see core's surveyFormDefaults), so submitting it untouched sends
// exactly what the one-tap answer does. Navigation (Back) lives in the
// sheet's header, not here.
export function PointDetailsForm({
  kind,
  tags,
  submitLabel,
  SubmitIcon = CheckCircleIcon,
  submitBox = "bg-green-600",
  submitInk = "light",
  onSubmit,
}: Props) {
  // Derive initial values from tags — recalculated when `tags` identity changes.
  const defaults = useMemo(() => surveyFormDefaults(tags), [tags]);
  const isRemoved = kind === "removed";
  const isOutOfOrder = kind === "out_of_order";
  const isBroken = kind === "broken";

  const [audience, setAudience] = useState<Audience>(defaults.audience);
  const [dispenser, setDispenser] = useState<Dispenser>(defaults.dispenser);
  const [seasonal, setSeasonal] = useState(defaults.seasonal);
  const [note, setNote] = useState(defaults.note);
  const [error, setError] = useState<string | null>(null);

  function editNote(next: string) {
    setNote(next);
    setError(null);
  }

  // Each pill's next note, or null when adding it would overflow NOTE_MAX.
  const quickTags = QUICK_TAGS.map((tag) => ({
    tag,
    active: hasQuickTag(note, tag),
    next: toggleQuickTag(note, tag),
  }));

  function handleSubmit() {
    const result = surveyExtras(kind, { audience, dispenser, seasonal, note });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSubmit(result.extras);
  }

  return (
    <View className="gap-4">
      {isRemoved ? (
        <View className="rounded-xl border border-red-300 bg-red-100 p-4">
          <Text className="text-callout font-semibold text-red-950">
            Confirm there&apos;s no fountain here.
          </Text>
        </View>
      ) : (
        <>
          <AudienceToggle value={audience} onChange={setAudience} />
          <DispenserToggle value={dispenser} onChange={setDispenser} />

          {/* Seasonal checkbox hidden on out of order page. Outside a list
              the HIG wants a button that toggles, not a switch. */}
          {!isOutOfOrder ? (
            <Pressable
              onPress={() => {
                hapticSelect();
                setSeasonal((s) => !s);
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: seasonal }}
              accessibilityLabel="Seasonal fountain"
              accessibilityHint="Runs only part of the year"
              className={`flex-row items-center justify-between rounded-xl border p-4 active:opacity-70 ${
                seasonal ? "border-sky-500 bg-sky-50" : "border-border bg-surface-deep"
              }`}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className={`h-6 w-6 items-center justify-center rounded-lg border ${
                    seasonal ? "border-sky-600 bg-sky-600" : "border-border bg-white"
                  }`}
                >
                  {seasonal ? <Text className="text-xs font-black text-white">✓</Text> : null}
                </View>
                <View className="gap-0.5">
                  <Text className="text-callout text-base font-semibold">Seasonal fountain</Text>
                  <Text className="text-muted text-sm">Runs only part of the year</Text>
                </View>
              </View>
              <SnowflakeIcon
                size={20}
                color={seasonal ? "#0284c7" : "#4d5c6a"}
                weight={seasonal ? "fill" : "regular"}
              />
            </Pressable>
          ) : null}
        </>
      )}

      {/* "Partially working" issue details + quick tag pills */}
      {isBroken ? (
        <View className="gap-2 pt-1">
          <Text
            accessibilityRole="header"
            className="text-muted text-xs font-bold tracking-wider uppercase"
          >
            What&apos;s wrong with the fountain?
          </Text>
          <View className="flex-row flex-wrap gap-1.5 pb-1">
            {quickTags.map(({ tag, active, next }) => (
              <Pressable
                key={tag}
                onPress={() => {
                  if (next === null) return;
                  hapticSelect();
                  editNote(next);
                }}
                disabled={next === null}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: next === null }}
                // Half the 6px gap, so neighbouring pills' targets never
                // overlap; with the padding that makes a 44pt target.
                hitSlop={3}
                className={`rounded-lg border px-3 py-3 active:opacity-70 ${
                  active ? "border-amber-600 bg-amber-500" : "border-border bg-surface-deep"
                } ${next === null ? "opacity-40" : ""}`}
              >
                <Text className="text-base text-sm font-semibold">{tag}</Text>
              </Pressable>
            ))}
          </View>
          {quickTags.some((q) => q.next === null) ? (
            <Text className="text-muted text-sm">Note is full. Shorten it to add more.</Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text
          accessibilityRole="header"
          className="text-muted text-xs font-bold tracking-wider uppercase"
        >
          {isBroken ? "Details / Note" : "Public Note"}
        </Text>
        <TextField
          value={note}
          onChangeText={editNote}
          placeholder={isBroken ? "Describe what's wrong…" : "Add a public note (optional)"}
          placeholderTextColor="#57544a"
          accessibilityLabel={isBroken ? "Details" : "Public note"}
          multiline
          maxLength={NOTE_MAX}
          className="border-border text-callout min-h-20 rounded-xl border bg-white p-3.5 text-base"
        />
        {error ? <Text className="text-sm font-semibold text-red-700">{error}</Text> : null}
      </View>

      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        className={`min-h-13 flex-row items-center justify-center gap-2 rounded-full px-4 py-3.5 active:opacity-70 ${submitBox}`}
      >
        <SubmitIcon size={20} color={INK[submitInk].hex} weight="bold" />
        <Text className={`text-lg font-bold ${INK[submitInk].text}`}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}
