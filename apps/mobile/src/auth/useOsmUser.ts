import { useEffect, useState } from "react";
import { api } from "../ports/api";
import { getToken, onAuthChange } from "./authStore";

// Mirror of the web hooks/useOsmUser: the signed-in user's OSM identity, trimmed
// by /api/osm/user to what the UI needs. Kept out of useOsmStatus so a status
// poll never costs an OSM API roundtrip.
export type OsmUser = {
  id: number | null;
  username: string | null;
  avatarUrl: string | null;
  changesetCount: number;
  accountCreated: string | null;
};

// Session cache so re-entering the profile screen doesn't re-hit the OSM API.
// Reset on any auth change (sign in/out) so a new account never shows the old one.
const holder: { user: OsmUser | null } = { user: null };
onAuthChange(() => {
  holder.user = null;
});

// The signed-in user's OSM identity, or null while signed out / loading.
// Follows sign-in and sign-out while mounted: with sign-in offered inside the
// app (not before it), Profile is often already open when it happens.
export function useOsmUser(): OsmUser | null {
  const [user, setUser] = useState<OsmUser | null>(holder.user);

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!getToken()) {
        setUser(null);
        return;
      }
      if (holder.user) {
        setUser(holder.user);
        return;
      }
      api
        .apiFetch("/api/osm/user")
        .then((r) => (r.ok ? r.json() : null))
        .then((u: OsmUser | null) => {
          if (!alive || !u || !getToken()) return;
          holder.user = u;
          setUser(u);
        })
        .catch(() => {});
    };
    load();
    const off = onAuthChange(load);
    return () => {
      alive = false;
      off();
    };
  }, []);

  return user;
}
