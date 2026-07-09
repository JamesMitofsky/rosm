"use client";

import Link from "next/link";
import { LinkIcon } from "@phosphor-icons/react";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmUser } from "@/hooks/useOsmUser";
import { useOutbox, outboxCounts } from "@/store/outbox";

// Shared style for a full-width drawer menu row: icon + label, bottom divider.
// Exported so nav links and the account row render identically.
export const MENU_ROW_CLASS =
  "border-paper-line text-ink hover:text-ink-dim flex items-center gap-3 border-b py-4 text-base font-semibold transition";

// The chip variant renders as the standard blue nav button (matching the Mapping
// Portal action), identical in both auth states. `relative` anchors the pending-
// sync dot.
const CHIP_CLASS =
  "bg-sky-deep text-paper hover:bg-sky-deep/90 relative inline-flex items-center gap-1.5 rounded-sm px-5 py-2 text-sm font-bold whitespace-nowrap transition";

// The user's OSM connection in any header. The label is always "Connection" —
// no state-dependent text swap — with a dot when edits are still waiting to reach
// OSM. Only the destination differs: signed out routes into the OSM sign-in flow;
// signed in (or showSignIn=false) links to the /mapping-portal hub.
// Renders nothing while the auth status resolves.
//   variant="chip" (default) → compact header chip.
//   variant="row"            → full-width drawer menu row matching nav links.
//   showSignIn=false         → always link to the (ungated) /mapping-portal hub
//                              rather than starting sign-in, even when signed out.
export default function AccountChip({
  variant = "chip",
  onNavigate,
  showSignIn = true,
}: {
  variant?: "chip" | "row";
  onNavigate?: () => void;
  showSignIn?: boolean;
}) {
  const { status } = useOsmStatus();
  const user = useOsmUser();
  const outboxItems = useOutbox((s) => s.items);
  const unsent = outboxCounts(outboxItems).unsent;

  if (!status) return null;

  const row = variant === "row";

  if (!status.loggedIn && showSignIn) {
    return (
      <OsmSignInLink onClick={onNavigate} className={row ? MENU_ROW_CLASS : CHIP_CLASS}>
        {row && <LinkIcon size={20} weight="bold" className="text-ink-dim shrink-0" />}
        Connection
      </OsmSignInLink>
    );
  }

  return (
    <Link
      href="/mapping-portal"
      onClick={onNavigate}
      title={user?.username ?? "Connected to OSM"}
      className={row ? MENU_ROW_CLASS : CHIP_CLASS}
    >
      {row && <LinkIcon size={20} weight="bold" className="text-ink-dim shrink-0" />}
      Connection
      {unsent > 0 && (
        <span
          title={`${unsent} edit${unsent === 1 ? "" : "s"} waiting to sync`}
          className={
            row
              ? "ml-1 h-2 w-2 rounded-full bg-amber-500"
              : "ring-paper absolute -top-0.5 -right-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2"
          }
        />
      )}
    </Link>
  );
}
