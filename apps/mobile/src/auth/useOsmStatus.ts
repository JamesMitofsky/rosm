import { useCallback, useEffect, useState } from "react";
import { api } from "../ports/api";
import { onAuthChange } from "./authStore";

export type OsmStatus = { loggedIn: boolean; apiBase: string; live: boolean };

// Mirror of the web components/OsmStatus: asks the server whether the current
// token is valid and which OSM (sandbox vs live) it targets. Refreshes on sign
// in/out.
export function useOsmStatus(): { status: OsmStatus | null; refresh: () => Promise<void> } {
  const [status, setStatus] = useState<OsmStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.apiFetch("/api/osm/status");
      setStatus((await r.json()) as OsmStatus);
    } catch {
      setStatus({ loggedIn: false, apiBase: "", live: false });
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount + re-fetch on auth change; refresh only setStates after its
    // await, so the rule's synchronous-setState concern doesn't apply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return onAuthChange(() => {
      refresh();
    });
  }, [refresh]);

  return { status, refresh };
}
