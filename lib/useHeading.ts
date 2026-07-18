"use client";

import { useCallback, useEffect, useState } from "react";

// Non-standard bits the DeviceOrientation API exposes but TS doesn't type.
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

// Read an absolute compass heading (degrees, 0 = north, clockwise) from a
// device-orientation event. iOS exposes `webkitCompassHeading` directly; other
// browsers give `alpha` counter-clockwise from north, so we invert it. Returns
// null when the event carries no absolute heading.
function headingFromEvent(e: CompassEvent): number | null {
  if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading;
  if (e.absolute && typeof e.alpha === "number") return (360 - e.alpha) % 360;
  return null;
}

// Reads the device compass heading (degrees, 0 = north, clockwise) — where the
// phone is *pointed*. This drives the blue-dot cone so it shows the user's
// facing; map rotation is handled separately from the GPS travel course. Returns
// null when no absolute heading is available (compass denied/unsupported).
//
// On iOS the compass needs an explicit, user-gesture permission grant:
// `needsPermission` is true until the caller invokes `requestPermission()` from
// a tap handler.
export function useHeading() {
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  const listen = useCallback(() => {
    const handler = (e: Event) => {
      const h = headingFromEvent(e as CompassEvent);
      if (h != null && Number.isFinite(h)) setCompassHeading(h);
    };
    // `deviceorientationabsolute` carries north-referenced data where supported;
    // iOS only fires `deviceorientation` (with webkitCompassHeading).
    const evt =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(evt, handler);
    return () => window.removeEventListener(evt, handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;
    const ctor = DeviceOrientationEvent as OrientationCtor;
    // iOS 13+ gates the sensor behind a permission prompt that must come from a
    // user gesture — defer to requestPermission(). Elsewhere, listen now.
    if (typeof ctor.requestPermission === "function") {
      // One-shot capability check on a browser-only global. Deliberately set in
      // the effect (not lazy init) so the server and first client render agree
      // — the prompt only appears after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeedsPermission(true);
      return;
    }
    return listen();
  }, [listen]);

  const requestPermission = useCallback(async () => {
    const ctor = DeviceOrientationEvent as OrientationCtor;
    setNeedsPermission(false); // hide the prompt regardless; we fall back on denial.
    if (typeof ctor.requestPermission !== "function") return;
    try {
      const res = await ctor.requestPermission();
      if (res === "granted") listen();
    } catch {
      // Denied or threw — keep the GPS-heading fallback.
    }
  }, [listen]);

  return {
    // Device facing (compass); null until an absolute heading arrives.
    heading: compassHeading,
    needsCompassPermission: needsPermission,
    requestCompass: requestPermission,
  };
}
