import * as Haptics from "expo-haptics";

// Each pattern keeps the meaning Apple documents for it (HIG: Playing haptics),
// so one never stands in for another.

// A task completed: an edit recorded, a stop reached.
export function hapticSuccess(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// A selection changed: a segmented option, a route toggle.
export function hapticSelect(): void {
  Haptics.selectionAsync().catch(() => {});
}

// Something landed: a touch-and-hold that dropped a point, the runner closing
// in on the next stop. Felt without looking at the screen.
export function hapticImpact(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}
