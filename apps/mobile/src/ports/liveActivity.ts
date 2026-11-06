import { AppState, Platform, type NativeEventSubscription } from "react-native";
import type { LiveActivity } from "expo-widgets";
import cfg from "@water-run/core/appConfig.json";
import type { LiveActivityPort, RunActivityState } from "@water-run/core/ports";
import {
  ACTIVITY_STALE_MS,
  shouldUpdateActivity,
  type PostedProgress,
  type ProgressLine,
} from "@water-run/core/runProgress";
import RunProgressActivity from "../widgets/RunProgressActivity";

// The run's Live Activity (widgets/RunProgressActivity): the next stop, its
// distance and the next turn on the Lock Screen and in the Dynamic Island.
// ports/runProgress decides between it and the notification line; this module
// says whether it could carry the run's progress, and the notification steps
// in whenever it can't: on Android, before iOS 16.2, with Live Activities
// switched off, or once the runner dismisses it.
//
// Updates are throttled like the notification line (shouldUpdateActivity), and
// each carries a stale date, so an activity the app stops updating dims rather
// than showing an old distance as current.

// Tapping the activity opens the run screen. If it's already open, the router
// reuses it.
const RUN_URL = `${cfg.scheme}://run`;

type Activity = LiveActivity<RunActivityState>;

let activity: Activity | null = null;
let latest: { line: ProgressLine; state: RunActivityState } | null = null;
let posted: PostedProgress | null = null;
// Starting failed, or the activity went away mid-run. Not retried until the app
// is next opened: the runner may have switched Live Activities back on in
// Settings, or reopened the app wanting the activity back.
let blocked = false;
let appState: NativeEventSubscription | null = null;

// Updates and ends run in call order, so an end can't land before an update
// still on its way and leave that update showing.
let queue: Promise<unknown> = Promise.resolve();
const inOrder = (step: () => Promise<unknown>) => {
  queue = queue.then(step).catch(() => {});
};

const staleAt = (nowMs: number) => new Date(nowMs + ACTIVITY_STALE_MS);

function start(nowMs: number): boolean {
  // ActivityKit starts a Live Activity only while the app is in the foreground.
  if (!latest || blocked || AppState.currentState !== "active") return false;
  try {
    activity = RunProgressActivity.start(latest.state, RUN_URL, staleAt(nowMs));
  } catch {
    // Not supported on this device, or switched off for the app.
    blocked = true;
    return false;
  }
  posted = { ...latest.line, atMs: nowMs };
  return true;
}

// The activities of this kind the system is showing (active or stale),
// including any a previous launch left: it died mid-run, so nothing ended them.
function shownActivities(): Activity[] {
  try {
    return RunProgressActivity.getInstances();
  } catch {
    return []; // before iOS 16.2, where there are none
  }
}

// The activity went away mid-run: the runner dismissed it, or switched Live
// Activities off. The notification line takes over.
function lost(): void {
  activity = null;
  posted = null;
  blocked = true;
}

// Send the latest progress if it's due. `flush` sends any change at once,
// ahead of the throttle: the app is going to the background, where the
// activity is what the runner will look at. Returns false if the activity is
// gone.
function update(flush: boolean): boolean {
  if (!activity || !latest) return false;
  const nowMs = Date.now();
  const due = flush
    ? posted?.body !== latest.line.body
    : shouldUpdateActivity(posted, latest.line, nowMs);
  if (!due) return true;
  // A dismissed activity can linger in ActivityKit's list, where an update
  // succeeds without showing anything, so check it's still on screen.
  const id = activity.getId();
  if (!shownActivities().some((a) => a.getId() === id)) {
    lost();
    return false;
  }
  posted = { ...latest.line, atMs: nowMs };
  const target = activity;
  const { state } = latest;
  inOrder(() =>
    target.update(state, staleAt(nowMs)).catch(() => {
      if (activity === target) lost();
    }),
  );
  return true;
}

function onAppState(next: string): void {
  if (next === "active") blocked = false;
  else if (next === "background") update(true);
}

// Hand over the run's latest progress; called on every fix. Returns whether the
// activity is carrying it, so the caller shows the notification line if not.
export function showRunActivity(line: ProgressLine, state: RunActivityState): boolean {
  if (Platform.OS !== "ios") return false;
  latest = { line, state };
  appState ??= AppState.addEventListener("change", onAppState);
  if (activity && update(false)) return true;
  return start(Date.now());
}

// The run ended or left the screen: take the activity down at once (HIG: end a
// Live Activity immediately when the task ends). Safe to call any time,
// including at launch, where it ends whatever a run the app didn't get to end
// left behind.
export function endRunActivity(): void {
  const own = activity;
  appState?.remove();
  appState = null;
  latest = null;
  posted = null;
  blocked = false;
  activity = null;
  if (Platform.OS !== "ios") return;
  // Listed now, not when the queue gets to it: a run starting meanwhile gets a
  // new activity, which this mustn't end.
  const ending = shownActivities();
  if (own && !ending.some((a) => a.getId() === own.getId())) ending.push(own);
  if (ending.length === 0) return;
  inOrder(() => Promise.all(ending.map((a) => a.end("immediate").catch(() => {}))));
}

export const liveActivity = {
  show: showRunActivity,
  end: endRunActivity,
} satisfies LiveActivityPort;
