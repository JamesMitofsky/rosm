import * as SecureStore from "expo-secure-store";

// The OSM bearer token, cached in memory (read synchronously by the api port) and
// persisted in the iOS keychain / Android keystore via expo-secure-store. A tiny
// listener set notifies the auth gate + status hooks on change.
const KEY = "osm_token";
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
