"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Shared "Sign in to OSM" affordance: a link to the cookie-based OAuth route
// (/api/osm/auth). Caller controls className/children so it matches each context;
// optional onClick runs after sign-in is kicked off (e.g. schedule a status refresh).
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
