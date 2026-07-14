"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import OsmSignInLink from "@/components/OsmSignInLink";

export type OsmStatus = { loggedIn: boolean; apiBase: string; live: boolean; dryRun?: boolean };

export function useOsmStatus() {
  const [status, setStatus] = useState<OsmStatus | null>(null);
  const refresh = () =>
    apiFetch("/api/osm/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  useEffect(() => {
    refresh();
    // Native sign-in completes out of band via a deep link — re-check on its event.
    const onChange = () => refresh();
    window.addEventListener("osm-auth-changed", onChange);
    return () => window.removeEventListener("osm-auth-changed", onChange);
  }, []);
  return { status, refresh };
}

const SIGN_IN_CLASS = "font-semibold underline decoration-sky-deep decoration-2 underline-offset-4";

export default function OsmStatusBar() {
  const { status } = useOsmStatus();
  if (!status || status.loggedIn) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <OsmSignInLink className={SIGN_IN_CLASS}>Sign in to OSM</OsmSignInLink>
    </div>
  );
}
