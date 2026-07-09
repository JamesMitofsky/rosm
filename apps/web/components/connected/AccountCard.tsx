"use client";

import { useState } from "react";
import { SignOutIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmUser } from "@/hooks/useOsmUser";
import { useOutbox, outboxCounts } from "@/store/outbox";
import { apiFetch, isNative } from "@/lib/api";
import { signOutOsm } from "@/lib/osmAuth";

// Who you are on OSM, and the way out. Signed out → a connect card, since the
// rest of the page (device-local archive) still works without an account.
export default function AccountCard() {
  const { status } = useOsmStatus();
  const user = useOsmUser();
  const outboxItems = useOutbox((s) => s.items);
  const unsent = outboxCounts(outboxItems).unsent;
  const [signingOut, setSigningOut] = useState(false);

  if (!status) return null;

  if (!status.loggedIn) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-bold">Connect OpenStreetMap</h2>
        <p className="text-ink-dim text-sm">
          Your runs are saved on this device either way — connecting lets you send fountain updates
          to OpenStreetMap under your name.
        </p>
        <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft w-fit rounded-sm px-5 py-2 text-sm font-bold transition">
          Connect with OpenStreetMap
        </OsmSignInLink>
      </div>
    );
  }

  async function signOut() {
    // Unsent edits stay queued on-device, but they can't reach OSM without the
    // token — make sure the user knows before cutting the session.
    if (
      unsent > 0 &&
      !window.confirm(
        `${unsent} edit${unsent === 1 ? "" : "s"} haven't reached OSM yet and can't sync while signed out. Sign out anyway?`,
      )
    ) {
      return;
    }
    setSigningOut(true);
    try {
      if (isNative()) {
        await signOutOsm();
      } else {
        await apiFetch("/api/osm/status", { method: "DELETE" });
        window.dispatchEvent(new Event("osm-auth-changed"));
      }
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display flex items-center gap-2 truncate text-lg font-bold">
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" aria-hidden />
          {user?.username ?? "Connected to OSM"}
        </span>
        <span className="text-ink-dim flex items-center gap-2 text-xs">
          {!status.live && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-600">
              Sandbox
            </span>
          )}
          {user?.username && (
            <a
              href={`https://www.openstreetmap.org/user/${encodeURIComponent(user.username)}`}
              target="_blank"
              rel="noreferrer"
              className="decoration-sky-deep underline decoration-2 underline-offset-2"
            >
              OSM profile
            </a>
          )}
          {user != null && user.changesetCount > 0 && (
            <span>
              {user.changesetCount} lifetime changeset{user.changesetCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={signOut}
        disabled={signingOut}
        className="flex shrink-0 items-center gap-1.5"
      >
        <SignOutIcon size={14} />
        {signingOut ? "Signing out…" : "Sign out"}
      </Button>
    </div>
  );
}
