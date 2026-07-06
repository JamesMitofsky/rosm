"use client";

import Link from "next/link";
import { UserCircleIcon } from "@phosphor-icons/react";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmUser } from "@/hooks/useOsmUser";
import { useOutbox, outboxCounts } from "@/store/outbox";

// The user's presence in any header: signed out → a sign-in affordance; signed
// in → an avatar chip linking to /profile, with a dot when edits are still
// waiting to reach OSM. Renders nothing while the auth status resolves.
export default function AccountChip({ showName = false }: { showName?: boolean }) {
  const { status } = useOsmStatus();
  const user = useOsmUser();
  const outboxItems = useOutbox((s) => s.items);
  const unsent = outboxCounts(outboxItems).unsent;

  if (!status) return null;

  if (!status.loggedIn) {
    return (
      <OsmSignInLink className="border-paper-line bg-paper/90 text-ink-dim hover:text-ink flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition">
        Sign in
      </OsmSignInLink>
    );
  }

  return (
    <Link
      href="/profile"
      title={user?.username ?? "Your profile"}
      className="border-paper-line bg-paper/90 text-ink-dim hover:text-ink relative flex items-center gap-2 rounded-full border px-1.5 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition"
    >
      {user?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <UserCircleIcon size={24} weight="duotone" className="text-sky-deep" />
      )}
      {showName && user?.username && <span className="text-ink pr-2">{user.username}</span>}
      {unsent > 0 && (
        <span
          title={`${unsent} edit${unsent === 1 ? "" : "s"} waiting to sync`}
          className="ring-paper absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2"
        />
      )}
    </Link>
  );
}
