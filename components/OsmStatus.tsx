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
  const { status, refresh } = useOsmStatus();
  if (!status) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span
        className={`rounded px-2 py-0.5 text-xs font-semibold ${
          status.live ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
        }`}
        title={status.apiBase}
      >
        {status.live ? "LIVE OSM" : "SANDBOX"}
      </span>
      {status.loggedIn ? (
        <button
          onClick={async () => {
            await fetch("/api/osm/status", { method: "DELETE" });
            refresh();
          }}
          className="text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
        >
          Sign out of OSM
        </button>
      ) : (
        <a href="/api/osm/auth" className="font-medium text-blue-600 underline underline-offset-2">
          Sign in to OSM
        </a>
      )}
    </div>
  );
}
