import * as Notifications from "expo-notifications";

// Show run alerts as banners even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const holder = { asked: false, granted: false };

export async function ensureNotifyPermission(): Promise<boolean> {
  if (holder.asked) return holder.granted;
  holder.asked = true;
  const { status } = await Notifications.requestPermissionsAsync();
  holder.granted = status === "granted";
  return holder.granted;
}

async function fire(id: string, title: string, body: string): Promise<void> {
  if (!holder.granted && !(await ensureNotifyPermission())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body },
    trigger: null,
  });
}

export function notifyProximity(name: string, meters: number): void {
  void fire("prox", "Survey point ahead", `${name} — about ${Math.round(meters)} m away.`);
}

export function notifyRunComplete(count: number): void {
  void fire("done", "Run complete", `You surveyed ${count} ${count === 1 ? "point" : "points"}.`);
}

export function notifySyncPending(count: number): void {
  void fire(
    "sync",
    "Edits uploading",
    `Sending your ${count} pending ${count === 1 ? "edit" : "edits"} to OpenStreetMap.`,
  );
}
