"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOsmStatus } from "@/components/OsmStatus";

// Dedicated sign-in page for the planner. The planner gates on OSM auth and
// sends unauthenticated users here; once logged in we bounce back to /plan.
export default function PlanLoginPage() {
  const router = useRouter();
  const { status: osm } = useOsmStatus();

  useEffect(() => {
    if (osm?.loggedIn) router.replace("/plan");
  }, [osm?.loggedIn, router]);

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-ink font-body text-cream">
      <Link
        href="/"
        className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-ink/80 px-4 py-2 font-display text-lg font-bold tracking-tight backdrop-blur md:left-5 md:top-5"
      >
        <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-volt" />
        Legwork Maps
      </Link>
      <section className="flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/10 bg-ink-soft/95 p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-volt">
            Sign in required
          </span>
          <h1 className="font-display text-3xl font-bold leading-tight">
            Connect your OpenStreetMap account
          </h1>
          <p className="text-sm text-cream-dim">
            The planner edits real OSM data. Sign in with your OpenStreetMap account to
            open the map and start building routes.
          </p>
        </div>
        <a
          href="/api/osm/auth"
          className="flex items-center justify-center gap-2 rounded-full bg-volt px-5 py-3 font-bold text-ink transition hover:bg-cream"
        >
          Sign in to OpenStreetMap
        </a>
      </section>
    </main>
  );
}
