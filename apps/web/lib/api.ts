"use client";

// Single entry point for talking to the ROSM backend (the Next.js /api routes).
// The web app and its API share an origin, so the httpOnly OSM session cookie
// carries auth automatically. This is the @rosm/core ApiPort implementation
// (wired in lib/coreSetup.ts).
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    // Same-origin cookie auth (the OSM session cookie).
    credentials: init.credentials ?? "include",
  });
}
