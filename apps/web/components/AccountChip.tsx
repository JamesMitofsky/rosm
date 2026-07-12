"use client";

import Link from "next/link";
import { LinkIcon } from "@phosphor-icons/react";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmUser } from "@/hooks/useOsmUser";
import { useOutbox, outboxCounts } from "@rosm/core/stores/outbox";

// Shared style for a full-width drawer menu row: icon + label, bottom divider.
// Exported so nav links and the account row render identically.
export const MENU_ROW_CLASS =
  "border-paper-line text-ink hover:text-ink-dim flex items-center gap-3 border-b py-4 text-base font-semibold transition";

// The chip variant renders as a compact nav button, identical in both auth
// states. `relative` anchors the pending-sync dot. Color is left to `chipTone`
// so callers can distinguish a primary action (blue) from a neutral one.
const CHIP_BASE_CLASS =
  "relative inline-flex items-center gap-1.5 rounded-sm font-bold whitespace-nowrap transition";

// Padding/type scale. `sm` matches the compact map header controls (search box,
// Filters) so a neutral Exit chip sits flush beside them.
const CHIP_SIZE_CLASS = {
  md: "px-5 py-2 text-sm",
  sm: "px-3 py-1.5 text-xs",
} as const;

const CHIP_TONE_CLASS = {
  // Standard blue nav button, matching the Mapping Portal action.
  blue: "bg-sky-deep text-paper hover:bg-sky-deep/90",
  // Neutral exit/secondary button — solid high-contrast fill so it reads
  // clearly against a busy map, without the primary blue's action emphasis.
  neutral: "bg-ink text-paper shadow-sm hover:bg-ink/90",
} as const;

// The user's OSM connection in any header. The label defaults to "Connection" —
// no state-dependent text swap — with a dot when edits are still waiting to reach
// OSM. Only the destination differs: signed out routes into the OSM sign-in flow;
// signed in (or showSignIn=false) links to the /mapping-portal hub.
// Renders nothing while the auth status resolves.
//   variant="chip" (default) → compact header chip.
//   variant="row"            → full-width drawer menu row matching nav links.
//   showSignIn=false         → always link to the (ungated) /mapping-portal hub
//                              rather than starting sign-in, even when signed out.
//   chipTone="neutral"       → render the chip in neutral tone (e.g. an Exit
//                              action) instead of the primary blue.
//   label                    → override the button text ("Connection" default).
export default function AccountChip({
  variant = "chip",
  onNavigate,
  showSignIn = true,
  chipTone = "blue",
  size = "md",
  label = "Connection",
}: {
  variant?: "chip" | "row";
  onNavigate?: () => void;
  showSignIn?: boolean;
  chipTone?: "blue" | "neutral";
  size?: "sm" | "md";
  label?: string;
}) {
  const { status } = useOsmStatus();
  const user = useOsmUser();
  const outboxItems = useOutbox((s) => s.items);
  const unsent = outboxCounts(outboxItems).unsent;

  if (!status) return null;

  const row = variant === "row";
  const chipClass = `${CHIP_BASE_CLASS} ${CHIP_SIZE_CLASS[size]} ${CHIP_TONE_CLASS[chipTone]}`;

  if (!status.loggedIn && showSignIn) {
    return (
      <OsmSignInLink onClick={onNavigate} className={row ? MENU_ROW_CLASS : chipClass}>
        {row && <LinkIcon size={20} weight="bold" className="text-ink-dim shrink-0" />}
        {label}
      </OsmSignInLink>
    );
  }

  return (
    <Link
      href="/mapping-portal"
      onClick={onNavigate}
      title={user?.username ?? "Connected to OSM"}
      className={row ? MENU_ROW_CLASS : chipClass}
    >
      {row && <LinkIcon size={20} weight="bold" className="text-ink-dim shrink-0" />}
      {label}
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
