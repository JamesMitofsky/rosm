import * as Haptics from "expo-haptics";

// Celebratory buzz when an edit is recorded / a point is reached (fire-and-forget).
export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
