import type { Pt } from "./geo";

// Hand-off to the device's own maps app for turn-by-turn walking directions.
//
// The in-app route is a preview; the phone's maps app owns live navigation —
// voice, lock-screen, rerouting — and every platform ships one that opens from a
// plain URL. Which one depends on the device, not the browser: an iPhone opens
// Apple Maps from any browser, everything else has Google Maps.

export type MapsPlatform = "apple" | "google";

// Pure so it can be tested: the caller passes `navigator.userAgent` and
// `navigator.maxTouchPoints`. The second one matters because iPadOS 13+ asks for
// desktop sites by default and reports itself as a Mac — the only tell left is
// that Macs have no touch points and iPads do.
export function detectMapsPlatform(ua: string, maxTouchPoints = 0): MapsPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "apple";
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return "apple";
  return "google";
}

// Coordinates at 6 decimals (~10 cm) — the precision OSM stores.
const coord = (n: number) => n.toFixed(6);

// A walking-directions URL to `dest`. No origin on purpose: both apps default to
// the device's live location, and a fix captured seconds ago in the browser is
// only ever staler than that.
export function walkingDirectionsUrl(platform: MapsPlatform, dest: Pt): string {
  const at = `${coord(dest.lat)},${coord(dest.lon)}`;
  if (platform === "apple") {
    // `dirflg=w` — walking. https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html
    return `https://maps.apple.com/?daddr=${at}&dirflg=w`;
  }
  // Maps URLs API. https://developers.google.com/maps/documentation/urls/get-started#directions-action
  return `https://www.google.com/maps/dir/?api=1&destination=${at}&travelmode=walking`;
}
