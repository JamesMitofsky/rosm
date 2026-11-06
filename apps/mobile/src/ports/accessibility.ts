import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

// The system accessibility settings the app adapts to, followed live (the
// user can flip them in Control Center mid-run), plus spoken announcements.

type Setting = "reduceMotionChanged" | "reduceTransparencyChanged";

const readers: Record<Setting, () => Promise<boolean>> = {
  reduceMotionChanged: () => AccessibilityInfo.isReduceMotionEnabled(),
  reduceTransparencyChanged: () => AccessibilityInfo.isReduceTransparencyEnabled(),
};

// Last known value per setting, shared so a component mounting later starts
// from it instead of flashing the default.
const known: Record<Setting, boolean> = {
  reduceMotionChanged: false,
  reduceTransparencyChanged: false,
};

function useSetting(setting: Setting): boolean {
  const [on, setOn] = useState(known[setting]);
  useEffect(() => {
    let alive = true;
    const update = (value: boolean) => {
      known[setting] = value;
      if (alive) setOn(value);
    };
    readers[setting]()
      .then(update)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(setting, update);
    return () => {
      alive = false;
      sub.remove();
    };
  }, [setting]);
  return on;
}

export const useReduceMotion = () => useSetting("reduceMotionChanged");
export const useReduceTransparency = () => useSetting("reduceTransparencyChanged");

// Read outside React (the confetti host listens for an event, not a render).
export function reduceMotionNow(): boolean {
  return known.reduceMotionChanged;
}
// Prime the cache at import, so the first celebration already respects it.
readers
  .reduceMotionChanged()
  .then((v) => {
    known.reduceMotionChanged = v;
  })
  .catch(() => {});

// Tell VoiceOver (and TalkBack) about a change it wouldn't otherwise notice:
// a saved edit, an arrival, an error that appeared over the map. Queued behind
// whatever it is already reading, so it doesn't cut off the label of the
// button just tapped.
export function announce(message: string): void {
  if (!message) return;
  try {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  } catch {
    AccessibilityInfo.announceForAccessibility(message);
  }
}
