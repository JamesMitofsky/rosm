import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import cfg from "@rosm/core/appConfig.json";
import { apiUrl } from "../ports/api";
import { storeToken, clearToken } from "./authStore";

// The whole OAuth dance (PKCE, state, token exchange against OSM) runs server-side,
// exactly as it did for the Capacitor build. We open the server's ?native=1 entry
// in an ASWebAuthenticationSession; the server redirects to rosm://osm-callback?token=…
// and openAuthSessionAsync hands that URL straight back.
const CALLBACK = `${cfg.scheme}://osm-callback`;

export type SignInResult = { ok: boolean; error?: string };

export async function signInOsm(): Promise<SignInResult> {
  const res = await WebBrowser.openAuthSessionAsync(apiUrl("/api/osm/auth?native=1"), CALLBACK);
  if (res.type !== "success") return { ok: false }; // user cancelled / dismissed
  const { queryParams } = Linking.parse(res.url);
  const token = typeof queryParams?.token === "string" ? queryParams.token : null;
  const error = typeof queryParams?.error === "string" ? queryParams.error : null;
  if (token) {
    await storeToken(token);
    return { ok: true };
  }
  return { ok: false, error: error ?? "Sign-in failed." };
}

export async function signOutOsm(): Promise<void> {
  await clearToken();
}
