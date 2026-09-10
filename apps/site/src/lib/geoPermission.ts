// Whether the browser would hand over the visitor's location without asking.
//
// The map wants to fly to a returning visitor on open, but must never put a
// permission prompt in front of someone who hasn't asked for it — that is both
// rude and the fastest way to get a permanent "deny". The Permissions API can
// tell the two apart without prompting. Where it can't, the answer is "prompt":
// the map shows its locate button and waits for a tap.

export type GeoPermission = "granted" | "prompt" | "denied";

export async function queryGeoPermission(): Promise<GeoPermission> {
  // Older iOS Safari and most WebViews ship no Permissions API at all.
  const perms = globalThis.navigator?.permissions;
  if (!perms?.query) return "prompt";
  try {
    const status = await perms.query({ name: "geolocation" });
    return status.state;
  } catch {
    // Safari (through at least 16) implements the API but rejects the
    // "geolocation" name with a TypeError. Treat that as unknown.
    return "prompt";
  }
}
