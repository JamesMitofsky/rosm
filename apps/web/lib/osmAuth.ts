"use client";

// Native (Capacitor) OSM auth controller.
//
// The web app authenticates with an httpOnly cookie on the same origin. The native
// app can't share that cookie with the remote API origin, so instead:
//   1. signInOsm() opens the OAuth flow in an in-app browser (?native=1).
//   2. The callback returns the token via a `rosm://osm-callback?token=…` deep link.
//   3. We capture it here, persist it in the native keychain (@capacitor/preferences),
//      and feed it to apiFetch as a Bearer token (setApiTokenGetter).
// All of this is a no-op on web, where the cookie flow stays intact.

import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { apiUrl, isNative, setApiTokenGetter } from "@/lib/api";

const TOKEN_KEY = "osm_token";
let cachedToken: string | null = null;
let initialized = false;

// Let any mounted useOsmStatus re-check /api/osm/status after the token changes
// (sign-in via deep link, or sign-out) — the change happens out of band.
function emitChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("osm-auth-changed"));
}

async function storeToken(token: string | null) {
  cachedToken = token;
  if (token) await Preferences.set({ key: TOKEN_KEY, value: token });
  else await Preferences.remove({ key: TOKEN_KEY });
  emitChange();
}

// Wire the native token into apiFetch, load any persisted token, and start
// listening for the OAuth deep-link return. Idempotent; safe no-op on web.
export async function initOsmAuth(): Promise<void> {
  if (!isNative() || initialized) return;
  initialized = true;
  setApiTokenGetter(() => cachedToken);

  const { value } = await Preferences.get({ key: TOKEN_KEY });
  cachedToken = value ?? null;

  await App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith("rosm://osm-callback")) return;
    await Browser.close().catch(() => {});
    let token: string | null = null;
    try {
      token = new URL(url).searchParams.get("token");
    } catch {
      // Malformed deep link — ignore; the user can retry sign-in.
    }
    if (token) await storeToken(token);
    else emitChange(); // surface the error state (status stays logged-out)
  });
}

// Begin sign-in: open the OAuth flow in an in-app browser. The token comes back
// through the deep-link listener above.
export async function signInOsm(): Promise<void> {
  await Browser.open({ url: apiUrl("/api/osm/auth?native=1") });
}

// Clear the native session.
export async function signOutOsm(): Promise<void> {
  await storeToken(null);
}

export function isOsmSignedIn(): boolean {
  return !!cachedToken;
}
