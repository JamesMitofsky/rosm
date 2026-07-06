"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useOsmStatus } from "@/components/OsmStatus";

export type OsmUser = {
  id: number | null;
  username: string | null;
  avatarUrl: string | null;
  changesetCount: number;
  accountCreated: string | null;
};

// The OSM identity is fetched from the OSM API, so cache it for the session
// rather than hitting it on every nav render.
const CACHE_KEY = "rosm:osm-user";

function readCache(): OsmUser | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as OsmUser) : null;
  } catch {
    return null;
  }
}

function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    // Storage unavailable — nothing cached to clear.
  }
}

// The signed-in user's OSM identity, or null while signed out / loading.
export function useOsmUser(): OsmUser | null {
  const { status } = useOsmStatus();
  const [user, setUser] = useState<OsmUser | null>(null);
  // Bumped when auth changes out of band (native deep link, sign-out) so the
  // fetch effect re-runs even if `loggedIn` never flipped.
  const [authEpoch, setAuthEpoch] = useState(0);

  useEffect(() => {
    const onChange = () => {
      clearCache();
      setUser(null);
      setAuthEpoch((n) => n + 1);
    };
    window.addEventListener("osm-auth-changed", onChange);
    return () => window.removeEventListener("osm-auth-changed", onChange);
  }, []);

  useEffect(() => {
    if (!status?.loggedIn) return;
    let alive = true;
    // Deferred off the effect body so the state update doesn't cascade-render
    // synchronously (same pattern as the planner's run recovery).
    Promise.resolve().then(() => {
      if (!alive) return;
      const cached = readCache();
      if (cached) {
        setUser(cached);
        return;
      }
      apiFetch("/api/osm/user")
        .then((r) => (r.ok ? r.json() : null))
        .then((u: OsmUser | null) => {
          if (!alive || !u) return;
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(u));
          } catch {
            // Storage unavailable — refetch next mount instead.
          }
          setUser(u);
        })
        .catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [status?.loggedIn, authEpoch]);

  return status?.loggedIn ? user : null;
}
