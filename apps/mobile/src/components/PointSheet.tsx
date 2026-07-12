import { useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  CheckCircleIcon,
  DogIcon,
  SnowflakeIcon,
  TrashIcon,
  WarningIcon,
} from "phosphor-react-native";
import type { EditAction, EditExtras, Fountain } from "@rosm/core/schemas";
import type { SyncState } from "@rosm/core/stores/outbox";
import { checkedAgoLabel } from "@rosm/core/checkDate";

// A point already recorded this session — mirrors the web PointPopup edit block.
export type PointEdit = {
  status: EditAction;
  summary: string;
  syncState: SyncState;
  changesetUrl?: string;
  extras?: EditExtras;
};

const STATUS_LABEL: Record<EditAction, string> = {
  confirm: "Confirmed working",
  out_of_order: "Marked out of order",
  removed: "Marked removed",
};

// Where the edit sits on its way to OSM — plain-language, since the outbox sends
// in the background.
const SYNC_LABEL: Record<SyncState, string> = {
  pending: "Saved on device",
  sending: "Sending to OSM…",
  sent: "Synced to OSM",
  failed: "Sync failed — will retry",
};

// True when OSM tags already flag this point as not human-potable.
function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

type ActionButton = {
  action: EditAction;
  title: string;
  Icon: typeof CheckCircleIcon;
  box: string; // background class
};

// The status updates the web popup offers, in the same order. (Dog-vs-human is
// now an `audience` extra on confirm, per @rosm/core schemas — the standalone
// "dog only" action was retired; porting that toggle to mobile is follow-up.)
const ACTIONS: ActionButton[] = [
  { action: "confirm", title: "Working — confirm", Icon: CheckCircleIcon, box: "bg-green-600" },
  { action: "out_of_order", title: "Out of order", Icon: WarningIcon, box: "bg-amber-500" },
  { action: "removed", title: "Removed", Icon: TrashIcon, box: "bg-red-600" },
];

type Props = {
  fountain: Fountain;
  // Present once the point has been updated this session → show the recorded
  // state instead of the action buttons.
  edit?: PointEdit;
  onAction: (action: EditAction, extras?: EditExtras) => void;
  // Planner-only: when provided, a route-membership toggle renders above the
  // status actions (green "Add to route" / red "Remove from route").
  inRoute?: boolean;
  onToggleRoute?: () => void;
};

// Bottom-sheet body for a tapped point: full point info (last-checked, name,
// dog-water flag) plus the OSM status buttons and advanced tags — the mobile
// mirror of the web PointPopup.
export function PointSheet({ fountain, edit, onAction, inRoute, onToggleRoute }: Props) {
  const tags = fountain.tags ?? {};
  // Advanced OSM params, prefilled from the node's current tags.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [seasonal, setSeasonal] = useState(tags.seasonal === "yes");
  const [osmNote, setOsmNote] = useState(tags.note ?? "");
  // Snapshot the clock once — the "checked ago" label needn't tick live.
  const [now] = useState(() => Date.now());

  function buildExtras(): EditExtras | undefined {
    const note = osmNote.trim();
    const extras: EditExtras = {};
    if (seasonal) extras.seasonal = true;
    if (note) extras.note = note;
    return Object.keys(extras).length ? extras : undefined;
  }

  return (
    <View className="gap-3">
      {/* Header: last-checked headline + name when the node actually has one.
          No close button — the native sheet dismisses by drag or scrim tap. */}
      <View>
        <Text className="text-ink text-base font-bold">{checkedAgoLabel(tags, now)}</Text>
        {tags.name ? <Text className="text-ink-dim text-sm">{tags.name}</Text> : null}
        {isDogWater(tags) ? (
          <View className="mt-1 flex-row items-center gap-1">
            <DogIcon size={14} color="#7c3aed" weight="fill" />
            <Text className="text-xs font-medium text-violet-700">Dog water — not for humans</Text>
          </View>
        ) : null}
      </View>

      {onToggleRoute ? (
        <Pressable
          onPress={onToggleRoute}
          accessibilityRole="button"
          className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
            inRoute ? "bg-red-600" : "bg-green-600"
          }`}
        >
          <Text className="text-base font-bold text-white">
            {inRoute ? "Remove from route" : "Add to route"}
          </Text>
        </Pressable>
      ) : null}

      {edit ? (
        // Recorded this session: show what was saved + its sync state.
        <View className="bg-paper-deep gap-1 rounded-xl p-3">
          <Text className="text-ink font-semibold">{STATUS_LABEL[edit.status]}</Text>
          <Text className="text-ink-dim text-sm">{edit.summary}</Text>
          {edit.extras?.seasonal ? (
            <View className="flex-row items-center gap-1">
              <SnowflakeIcon size={14} color="#0369a1" />
              <Text className="text-xs text-sky-700">Seasonal</Text>
            </View>
          ) : null}
          {edit.extras?.note ? (
            <Text className="text-ink-dim text-xs italic">“{edit.extras.note}”</Text>
          ) : null}
          <Text className="text-ink-dim mt-0.5 text-xs font-medium">
            {SYNC_LABEL[edit.syncState]}
          </Text>
          {edit.changesetUrl ? (
            <Pressable
              onPress={() => Linking.openURL(edit.changesetUrl!)}
              className="mt-0.5 flex-row items-center gap-1"
            >
              <ArrowSquareOutIcon size={14} color="#0c0d0a" />
              <Text className="text-ink text-xs font-semibold underline">view on OSM</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {/* The four status updates. */}
          <View className="gap-2">
            {ACTIONS.map(({ action, title, Icon, box }) => (
              <Pressable
                key={action}
                onPress={() => onAction(action, buildExtras())}
                accessibilityRole="button"
                className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${box}`}
              >
                <Icon size={18} color="#ffffff" weight="bold" />
                <Text className="text-base font-bold text-white">{title}</Text>
              </Pressable>
            ))}
          </View>

          {/* Advanced OSM tags: seasonal + public note, written to the node. */}
          <View className="border-paper-line border-t pt-2">
            <Pressable
              onPress={() => setAdvancedOpen((o) => !o)}
              className="flex-row items-center gap-1"
              accessibilityRole="button"
            >
              {advancedOpen ? (
                <CaretDownIcon size={14} color="#6b7280" />
              ) : (
                <CaretRightIcon size={14} color="#6b7280" />
              )}
              <Text className="text-ink-dim text-sm font-medium">Advanced</Text>
            </Pressable>

            {advancedOpen ? (
              <View className="mt-2 gap-2">
                <Pressable
                  onPress={() => setSeasonal((s) => !s)}
                  className="flex-row items-start gap-2"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: seasonal }}
                >
                  <View
                    className={`mt-0.5 h-4 w-4 items-center justify-center rounded border ${
                      seasonal ? "border-sky-600 bg-sky-600" : "border-paper-line bg-white"
                    }`}
                  >
                    {seasonal ? <Text className="text-[10px] font-bold text-white">✓</Text> : null}
                  </View>
                  <Text className="text-ink flex-1 text-sm">
                    Seasonal — runs only part of the year
                  </Text>
                </Pressable>
                <TextInput
                  value={osmNote}
                  onChangeText={setOsmNote}
                  placeholder="Public note — added to OSM"
                  placeholderTextColor="#9ca3af"
                  multiline
                  maxLength={255}
                  className="border-paper-line text-ink min-h-16 rounded-lg border px-3 py-2 text-sm"
                />
              </View>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
