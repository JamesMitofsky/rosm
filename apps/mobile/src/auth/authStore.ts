import * as SecureStore from "expo-secure-store";
import { API_BASE } from "../ports/api";

// The OSM bearer token, cached in memory (read synchronously by the api port) and
// persisted in the iOS keychain / Android keystore via expo-secure-store. A tiny
// listener set notifies the auth gate + status hooks on change.
//
// Namespaced by API host so a dev/sandbox token and a prod TestFlight token can
// coexist on the same device — switching EXPO_PUBLIC_DEV_API_BASE reads from a
// different keychain entry rather than clobbering the previously signed-in one.
// SecureStore keys must match [A-Za-z0-9._-]; hostnames satisfy that with `.` and
// `-`, but a `:port` suffix would not, so any stray char is coerced to `_`.
const host = (() => {
  try {
    return new URL(API_BASE).host;
  } catch {
    return "";
  }
})();
const KEY = host ? `osm_token_${host.replace(/[^A-Za-z0-9._-]/g, "_")}` : "osm_token";
const holder: { token: string | null } = { token: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export const getToken = (): string | null => holder.token;

export const onAuthChange = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export async function loadToken(): Promise<void> {
  holder.token = (await SecureStore.getItemAsync(KEY)) ?? null;
  emit();
}

export async function storeToken(token: string): Promise<void> {
  holder.token = token;
  await SecureStore.setItemAsync(KEY, token);
  emit();
}

export async function clearToken(): Promise<void> {
  holder.token = null;
  await SecureStore.deleteItemAsync(KEY);
  emit();
}
