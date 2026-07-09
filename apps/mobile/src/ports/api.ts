import type { ApiPort } from "@rosm/core/ports";
import { getToken } from "../auth/authStore";

// Absolute base for the ROSM backend (the Next.js /api routes on Vercel), injected
// at build time per EAS profile. Empty in dev falls back to same-origin, which only
// makes sense on web; on device set EXPO_PUBLIC_API_BASE.
const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

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
