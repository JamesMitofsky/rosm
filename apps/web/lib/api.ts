"use client";

// Single entry point for talking to the Run Verified Fountains backend (the Next.js
// `/api` routes). The web app and its API share an origin, so the base is empty and
// the httpOnly OSM cookie carries auth automatically.

// Trailing slash stripped so `${API_BASE}${path}` never double-slashes.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").replace(/\/$/, "");

// Resolve an `/api/...` path to an absolute URL. Absolute URLs (e.g. third-party
// APIs) pass through untouched.
export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${API_BASE}${path}`;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    // Same-origin cookie auth on web.
    credentials: init.credentials ?? "include",
  });
}
