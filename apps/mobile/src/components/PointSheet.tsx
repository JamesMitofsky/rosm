import { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
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
  broken: "Marked broken but working",
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
  { action: "confirm", title: "Working", Icon: CheckCircleIcon, box: "bg-green-600" },
  { action: "broken", title: "Broken but working", Icon: WrenchIcon, box: "bg-amber-500" },
  { action: "out_of_order", title: "Out of order", Icon: WarningIcon, box: "bg-orange-600" },
  { action: "removed", title: "Removed", Icon: TrashIcon, box: "bg-red-600" },
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
  if (prevId !== fountain.id) {
    setPrevId(fountain.id);
    setDetailFor(null);
  }

  return (
    <View className="gap-3.5 px-1 py-1">
      {tags.name || isDogWater(tags) ? (
        <View className="pb-1">
          {tags.name ? <Text className="text-ink text-lg font-bold">{tags.name}</Text> : null}
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
        <View className="border-paper-line bg-paper-deep gap-1.5 rounded-xl border p-4">
          <Text className="text-ink text-base font-bold">{STATUS_LABEL[edit.status]}</Text>
          <Text className="text-ink text-sm font-semibold">{edit.summary}</Text>
          {edit.extras?.seasonal ? (
            <View className="flex-row items-center gap-1">
              <SnowflakeIcon size={14} color="#0369a1" />
              <Text className="text-xs font-bold text-sky-800">Seasonal</Text>
            </View>
          ) : null}
          {edit.extras?.note ? (
            <Text className="text-ink text-xs font-medium italic">“{edit.extras.note}”</Text>
          ) : null}
          <Text className="text-ink-dim mt-0.5 text-xs font-bold">
            {SYNC_LABEL[edit.syncState]}
          </Text>
          {edit.changesetUrl ? (
            <Pressable
              onPress={() => Linking.openURL(edit.changesetUrl!)}
              className="mt-0.5 flex-row items-center gap-1"
            >
              <ArrowSquareOutIcon size={14} color="#0c0d0a" />
              <Text className="text-ink text-xs font-bold underline">View online</Text>
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
                ? "Mark broken but working"
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
        <View className="gap-3 py-1">
          {ACTIONS.map(({ action, title, Icon, box }) => (
            <Pressable
              key={action}
              onPress={() => setDetailFor(action)}
              accessibilityRole="button"
              className={`flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${box}`}
            >
              <Icon size={18} color="#ffffff" weight="bold" />
              <Text className="text-base font-bold text-white">{title}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
