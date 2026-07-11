"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmEdits } from "@/hooks/useOsmEdits";
import FountainMap from "@/components/fountains/FountainMap";
import EditSyncPanel from "@/components/EditSyncPanel";
import ErrorNotice from "@/components/ui/ErrorNotice";

const RETURN_TO = "/mapping-portal/quick-update";

// Quick Update: auto-locate, show drinking-water points within ~0.2mi, and let
// a signed-in surveyor update them straight from the map. OSM-gated — editing
// records real data under the user's name, so logged-out visitors are bounced
// to sign in (unlike the public /fountains browser, which stays read-only).
export default function QuickUpdatePage() {
  const router = useRouter();
  const { status: osm } = useOsmStatus();
  const [editErr, setEditErr] = useState<string | null>(null);

  // Direct OSM edits made from the map, backed by the offline outbox.
  const osmEdits = useOsmEdits({ tagKey: "amenity", onError: setEditErr });

  // Hard gate: no account → sign in first, then return here.
  useEffect(() => {
    if (osm && !osm.loggedIn) router.replace(`/login?returnTo=${RETURN_TO}`);
  }, [osm, router]);

  // Blank while status resolves / during the redirect, so we never flash the
  // editable map to a logged-out user.
  if (!osm || !osm.loggedIn) return <main className="bg-paper h-dvh w-screen" />;

  return (
    <FountainMap
      editable={osmEdits}
      defaultRadiusMi={0.2}
      footer={
        <div className="flex flex-col gap-2">
          {editErr && <ErrorNotice message={editErr} tone="light" />}
          <EditSyncPanel osmEdits={osmEdits} />
        </div>
      }
    />
  );
}
