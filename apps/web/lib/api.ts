"use client";

// Single entry point for talking to the ROSM backend (the Next.js `/api` routes).
//
// On the web the app and its API share an origin, so the base is empty and the
// httpOnly OSM cookie carries auth automatically. In the native (Capacitor) build
// the static frontend is bundled into the app and the API lives on a remote host
// (Vercel), so we must (a) prefix an absolute base URL and (b) carry the OSM token
// as a `Bearer` header — cookies don't cross the `capacitor://localhost` origin.
//
// CORS is sidestepped on native by enabling CapacitorHttp (see capacitor.config),
// which routes fetch through the native HTTP stack.

import { Capacitor } from "@capacitor/core";

export const isNative = () => Capacitor.isNativePlatform();

// Trailing slash stripped so `${API_BASE}${path}` never double-slashes.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

// Server-side run/draft persistence writes a single global JSON file
// (multi-user-unsafe) and needs the network. Native relies on the local route
// archive (localStorage) + IndexedDB outbox instead, so these calls are
// short-circuited there. See hooks/useRunSession.ts for the archive-based hydrate.
const NATIVE_NOOP = /^\/api\/(run|draft)\b/;

// The native auth layer (Phase 3) injects a getter so the web bundle keeps no hard
// dependency on @capacitor/preferences. Returns the stored OSM bearer token, or
// null on web / when signed out.
let tokenGetter: (() => string | null) | null = null;
export function setApiTokenGetter(fn: () => string | null) {
  tokenGetter = fn;
}

// Resolve an `/api/...` path to an absolute URL for the current platform.
// Absolute URLs (e.g. third-party APIs) pass through untouched.
export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

const jsonOk = (body: string) =>
  new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (isNative() && NATIVE_NOOP.test(path)) return jsonOk("null");

  const headers = new Headers(init.headers);
  const token = tokenGetter?.();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  return fetch(apiUrl(path), {
    ...init,
    headers,
    // Same-origin cookie auth on web; harmless on native (no cookies for the API
    // origin — the Bearer header carries auth there).
    credentials: init.credentials ?? "include",
  });
}
