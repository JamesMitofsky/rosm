import { progressLine, runActivityState, type RunProgressInput } from "@water-run/core/runProgress";
import { endRunActivity, showRunActivity } from "./liveActivity";
import { endProgressNotification, showProgressNotification } from "./notify";

// The run's progress on the lock screen, on one surface at a time: the Live
// Activity where there is one, otherwise the notification line. Never both
// (HIG: don't send notifications alongside a Live Activity for the same
// updates), so whichever isn't in use is taken down.

let notifying = false;

// Hand over the run's latest progress; called on every fix. Cheap: each surface
// sends only what's worth sending.
export function showRunProgress(p: RunProgressInput): void {
  const line = progressLine(p);
  if (showRunActivity(line, runActivityState(p))) {
    if (notifying) endProgressNotification();
    notifying = false;
    return;
  }
  notifying = true;
  showProgressNotification(line);
}

// The run ended or left the screen: take its progress down, wherever it shows.
// Safe to call any time, including at launch to clear what a run the app
// didn't get to end left behind.
export function endRunProgress(): void {
  notifying = false;
  endRunActivity();
  endProgressNotification();
}
