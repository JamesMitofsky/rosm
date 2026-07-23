import { useState } from "react";
import { Linking, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  SnowflakeIcon,
  TrashIcon,
  WarningIcon,
  WrenchIcon,
} from "phosphor-react-native";
import { DogIcon } from "./icons/DogIcon";
import type { EditAction, EditExtras, Fountain } from "@rosm/core/schemas";
import type { SyncState } from "@rosm/core/stores/outbox";
import { PointDetailsForm } from "./PointDetailsForm";

export type SurveyAction = EditAction | "broken";

export type PointEdit = {
  status: SurveyAction;
  summary: string;
  syncState: SyncState;
  changesetUrl?: string;
  extras?: EditExtras;
};

const STATUS_LABEL: Record<SurveyAction, string> = {
  confirm: "Confirmed working",
  broken: "Marked working but broken",
  out_of_order: "Marked out of order",
  removed: "Marked removed",
};

const SYNC_LABEL: Record<SyncState, string> = {
  pending: "Saved on device",
  sending: "Syncing…",
  sent: "Synced",
  failed: "Sync failed — will retry",
};

function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

type ActionButton = {
  action: SurveyAction;
  title: string;
  Icon: typeof CheckCircleIcon;
  box: string;
};

const ACTIONS: ActionButton[] = [
  { action: "out_of_order", title: "Out of order", Icon: WarningIcon, box: "bg-orange-600" },
  { action: "confirm", title: "Working", Icon: CheckCircleIcon, box: "bg-green-600" },
  { action: "removed", title: "Removed", Icon: TrashIcon, box: "bg-red-600" },
  { action: "broken", title: "Working but broken", Icon: WrenchIcon, box: "bg-amber-500" },
];

type Props = {
  fountain: Fountain;
  edit?: PointEdit;
  onAction: (action: SurveyAction, extras?: EditExtras) => void;
  inRoute?: boolean;
  onToggleRoute?: () => void;
};

export function PointSheet({ fountain, edit, onAction, inRoute, onToggleRoute }: Props) {
  const tags = fountain.tags ?? {};
  const [detailFor, setDetailFor] = useState<
    "confirm" | "broken" | "out_of_order" | "removed" | null
  >(null);

  const [prevId, setPrevId] = useState(fountain.id);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  if (prevId !== fountain.id) {
    setPrevId(fountain.id);
    setDetailFor(null);
    setMaxHeight(null);
  }

  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h && (!maxHeight || h > maxHeight)) {
      setMaxHeight(h);
    }
  };

  return (
    <View className="gap-3.5 px-1 py-1">
      {tags.name || isDogWater(tags) ? (
        <View className="pb-1">
          {tags.name ? <Text className="text-base text-lg font-bold">{tags.name}</Text> : null}
          {isDogWater(tags) ? (
            <View className="mt-1.5 flex-row items-center gap-1.5 self-start rounded-lg border border-violet-300 bg-violet-100 px-2.5 py-1">
              <DogIcon size={14} color="#5b21b6" />
              <Text className="text-xs font-bold text-violet-950">Dog water — not for humans</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {onToggleRoute ? (
        <Pressable
          onPress={onToggleRoute}
          accessibilityRole="button"
          className={`flex-row items-center justify-center gap-2 rounded-xl px-5 py-4 ${
            inRoute ? "bg-red-600" : "bg-green-600"
          }`}
        >
          <Text className="text-base font-bold text-white">
            {inRoute ? "Remove from route" : "Add to route"}
          </Text>
        </Pressable>
      ) : null}

      {edit ? (
        <View className="border-border bg-surface-deep gap-1.5 rounded-xl border p-4">
          <Text className="text-base font-bold">{STATUS_LABEL[edit.status]}</Text>
          <Text className="text-base text-sm font-semibold">{edit.summary}</Text>
          {edit.extras?.seasonal ? (
            <View className="flex-row items-center gap-1">
              <SnowflakeIcon size={14} color="#0369a1" />
              <Text className="text-info-800 text-xs font-bold">Seasonal</Text>
            </View>
          ) : null}
          {edit.extras?.note ? (
            <Text className="text-base text-xs font-medium italic">“{edit.extras.note}”</Text>
          ) : null}
          <Text className="text-muted mt-0.5 text-xs font-bold">{SYNC_LABEL[edit.syncState]}</Text>
          {edit.changesetUrl ? (
            <Pressable
              onPress={() => Linking.openURL(edit.changesetUrl!)}
              className="mt-0.5 flex-row items-center gap-1"
            >
              <ArrowSquareOutIcon size={14} color="#0c0d0a" />
              <Text className="text-base text-xs font-bold underline">View online</Text>
            </Pressable>
          ) : null}
        </View>
      ) : detailFor ? (
        <PointDetailsForm
          tags={tags}
          submitLabel={
            detailFor === "confirm"
              ? "Confirm working"
              : detailFor === "broken"
                ? "Mark working but broken"
                : detailFor === "out_of_order"
                  ? "Mark out of order"
                  : "Confirm removed"
          }
          SubmitIcon={
            detailFor === "confirm"
              ? CheckCircleIcon
              : detailFor === "broken"
                ? WrenchIcon
                : detailFor === "out_of_order"
                  ? WarningIcon
                  : TrashIcon
          }
          submitBox={
            detailFor === "confirm"
              ? "bg-green-600"
              : detailFor === "broken"
                ? "bg-amber-500"
                : detailFor === "out_of_order"
                  ? "bg-orange-600"
                  : "bg-red-600"
          }
          isRemoved={detailFor === "removed"}
          isOutOfOrder={detailFor === "out_of_order"}
          isBroken={detailFor === "broken"}
          onSubmit={(extras) => {
            onAction(detailFor, extras);
            setDetailFor(null);
          }}
        />
      ) : (
        <View className="gap-4 py-1">
          <View className="flex-row gap-4">
            {ACTIONS.slice(0, 2).map(({ action, title, Icon, box }) => (
              <Pressable
                key={action}
                onPress={() => setDetailFor(action)}
                accessibilityRole="button"
                onLayout={handleLayout}
                style={{ height: maxHeight ?? undefined }}
                className={`flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 ${box}`}
              >
                <Icon size={28} color="#ffffff" weight="bold" />
                <Text className="flex-shrink text-center text-sm font-bold text-white">
                  {title}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row gap-4">
            {ACTIONS.slice(2, 4).map(({ action, title, Icon, box }) => (
              <Pressable
                key={action}
                onPress={() => setDetailFor(action)}
                accessibilityRole="button"
                onLayout={handleLayout}
                style={{ height: maxHeight ?? undefined }}
                className={`flex-1 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-4 ${box}`}
              >
                <Icon size={28} color="#ffffff" weight="bold" />
                <Text className="flex-shrink text-center text-sm font-bold text-white">
                  {title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
