import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { CheckCircleIcon, SnowflakeIcon } from "phosphor-react-native";
import type { Audience, Dispenser, EditExtras } from "@rosm/core/schemas";
import { audienceFromTags } from "@rosm/core/audience";
import { dispenserFromTags } from "@rosm/core/dispenser";
import { AudienceToggle } from "./AudienceToggle";
import { DispenserToggle } from "./DispenserToggle";

const QUICK_TAGS = [
  "Not draining",
  "Low water pressure",
  "One fountain not running",
  "Bottle filler not running",
];

type Props = {
  tags: Record<string, string>;
  submitLabel: string;
  SubmitIcon?: typeof CheckCircleIcon;
  submitBox?: string;
  onSubmit: (extras?: EditExtras) => void;
  onCancel?: () => void;
  isRemoved?: boolean;
  isOutOfOrder?: boolean;
  isBroken?: boolean;
};

export function PointDetailsForm({
  tags,
  submitLabel,
  SubmitIcon = CheckCircleIcon,
  submitBox = "bg-green-600",
  onSubmit,
  onCancel,
  isRemoved = false,
  isOutOfOrder = false,
  isBroken = false,
}: Props) {
  // Derive initial values from tags — recalculated when `tags` identity changes.
  const defaults = useMemo(
    () => ({
      audience: audienceFromTags(tags),
      dispenser: dispenserFromTags(tags),
      seasonal: tags.seasonal === "yes",
      note: tags.note ?? tags.description ?? "",
    }),
    [tags],
  );

  const [audience, setAudience] = useState<Audience>(defaults.audience);
  const [dispenser, setDispenser] = useState<Dispenser>(defaults.dispenser);
  const [seasonal, setSeasonal] = useState(defaults.seasonal);
  const [note, setNote] = useState(defaults.note);

  function toggleQuickTag(tagText: string) {
    if (note.includes(tagText)) {
      const updated = note
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s !== tagText)
        .join("; ");
      setNote(updated);
    } else {
      setNote(note ? `${note}; ${tagText}` : tagText);
    }
  }

  function handleSubmit() {
    const trimmed = note.trim();
    if (isRemoved) {
      onSubmit(trimmed ? { note: trimmed } : undefined);
      return;
    }
    const extras: EditExtras = { audience, dispenser };
    if (seasonal && !isOutOfOrder) extras.seasonal = true;
    if (trimmed) extras.note = trimmed;
    onSubmit(extras);
  }

  return (
    <View className="gap-3.5">
      {isRemoved ? (
        <View className="rounded-xl border border-red-300 bg-red-100 p-4">
          <Text className="text-sm font-bold text-red-950">
            Confirm marking this fountain as removed.
          </Text>
        </View>
      ) : (
        <>
          <AudienceToggle value={audience} onChange={setAudience} />
          <DispenserToggle value={dispenser} onChange={setDispenser} />

          {/* Seasonal checkbox hidden on out of order page */}
          {!isOutOfOrder ? (
            <Pressable
              onPress={() => setSeasonal((s) => !s)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: seasonal }}
              accessibilityLabel="Seasonal fountain"
              className={`flex-row items-center justify-between rounded-xl border p-4 ${
                seasonal ? "border-sky-500 bg-sky-50" : "border-paper-line bg-paper-deep"
              }`}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className={`h-6 w-6 items-center justify-center rounded-lg border ${
                    seasonal ? "border-sky-600 bg-sky-600" : "border-paper-line bg-white"
                  }`}
                >
                  {seasonal ? <Text className="text-xs font-black text-white">✓</Text> : null}
                </View>
                <View className="gap-0.5">
                  <Text className="text-ink text-sm font-bold">Seasonal fountain</Text>
                  <Text className="text-ink-dim text-xs font-semibold">
                    Runs only part of the year
                  </Text>
                </View>
              </View>
              <SnowflakeIcon
                size={20}
                color={seasonal ? "#0284c7" : "#57544a"}
                weight={seasonal ? "fill" : "regular"}
              />
            </Pressable>
          ) : null}
        </>
      )}

      {/* 4th Category "Working but broken" issue details + quick tag pills */}
      {isBroken ? (
        <View className="gap-2 pt-1">
          <Text className="text-ink text-xs font-bold tracking-wider uppercase">
            What&apos;s wrong with the fountain?
          </Text>
          <View className="flex-row flex-wrap gap-1.5 pb-1">
            {QUICK_TAGS.map((tag) => {
              const active = note.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleQuickTag(tag)}
                  className={`rounded-lg border px-2.5 py-1.5 ${
                    active ? "border-amber-600 bg-amber-500" : "border-paper-line bg-paper-deep"
                  }`}
                >
                  <Text className={`text-xs font-bold ${active ? "text-white" : "text-ink"}`}>
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-1.5">
        <Text className="text-ink text-xs font-bold tracking-wider uppercase">
          {isBroken ? "Details / Note" : "Public Note"}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={isBroken ? "Describe what's wrong…" : "Add a public note (optional)"}
          placeholderTextColor="#57544a"
          multiline
          maxLength={255}
          className="border-paper-line text-ink min-h-20 rounded-xl border bg-white p-3.5 text-sm font-medium"
        />
      </View>

      <View className="flex-row gap-3 pt-2">
        {onCancel ? (
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            className="border-paper-line bg-paper-deep flex-1 items-center justify-center rounded-xl border px-4 py-3"
          >
            <Text className="text-ink text-base font-bold">Back</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleSubmit}
          accessibilityRole="button"
          className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${submitBox}`}
        >
          <SubmitIcon size={18} color="#ffffff" weight="bold" />
          <Text className="text-base font-bold text-white">{submitLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}
