"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isNative } from "@/lib/api";
import { signInOsm } from "@/lib/osmAuth";

// Shared "Sign in to OSM" affordance.
//   web    → a link to the cookie-based OAuth route (/api/osm/auth).
//   native → a button that opens the OAuth flow in an in-app browser; the token
//            returns via the rosm:// deep link (see lib/osmAuth).
// Caller controls className/children so it matches each context; optional onClick
// runs after sign-in is kicked off (e.g. schedule a status refresh).
export default function OsmSignInLink({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  if (isNative()) {
    return (
      <button
        type="button"
        onClick={() => {
          signInOsm();
          onClick?.();
        }}
        className={className}
      >
        {children}
      </button>
    );
  }
  // Preserve the current page so the OAuth callback can return here (see
  // /api/osm/auth + /api/osm/callback), instead of always bouncing to `/`.
  const href = pathname
    ? `/api/osm/auth?returnTo=${encodeURIComponent(pathname)}`
    : "/api/osm/auth";
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
