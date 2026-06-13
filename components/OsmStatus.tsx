"use client";

import { useEffect, useState } from "react";

export type OsmStatus = { loggedIn: boolean; apiBase: string; live: boolean };

export function useOsmStatus() {
  const [status, setStatus] = useState<OsmStatus | null>(null);
  const refresh = () =>
    fetch("/api/osm/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  useEffect(() => {
    refresh();
  }, []);
  return { status, refresh };
}

export default function OsmStatusBar() {
  const { status } = useOsmStatus();
  if (!status) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      {status.loggedIn ? (
        <span
          className="flex items-center gap-1.5 rounded-full bg-volt px-2.5 py-1 text-xs font-semibold text-ink"
          title={status.apiBase}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink/70" />
          Connected
        </span>
      ) : (
        <a
          href="/api/osm/auth"
          className="font-semibold underline decoration-volt decoration-2 underline-offset-4"
        >
          Sign in to OSM
        </a>
      )}
    </div>
  );
}
