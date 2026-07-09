import type { ApiPort } from "@rosm/core/ports";
import cfg from "@rosm/core/appConfig.json";
import { getToken } from "../auth/authStore";

// Absolute base for the ROSM backend (the Next.js /api routes on Vercel). EAS build
// profiles inject EXPO_PUBLIC_API_BASE; a local `expo start` has no such env, so we
// fall back to the shared appConfig default rather than emitting a relative URL —
// on device a relative URL has no origin and crashes native modules (e.g. the OSM
// auth session). Override via EXPO_PUBLIC_API_BASE when pointing at a preview backend.
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || cfg.apiBase || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

// Server-side run/draft persistence is web-only (a single JSON file); on device the
// route archive is the source of truth, so these calls no-op with a null body.
const NATIVE_NOOP = /^\/api\/(run|draft)\b/;

export const api: ApiPort = {
  apiFetch: async (path, init = {}) => {
    if (NATIVE_NOOP.test(path)) {
      return new Response("null", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    return fetch(apiUrl(path), { ...init, headers });
  },
};
