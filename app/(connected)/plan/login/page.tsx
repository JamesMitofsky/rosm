"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOsmStatus } from "@/components/OsmStatus";
import OsmSignInLink from "@/components/OsmSignInLink";
import AddToHomescreenPrompt from "@/components/AddToHomescreenPrompt";

// Dedicated sign-in page for the planner. The planner gates on OSM auth and
// sends unauthenticated users here; once logged in we bounce back to /plan.
export default function PlanLoginPage() {
  const router = useRouter();
  const { status: osm } = useOsmStatus();

  useEffect(() => {
    if (osm?.loggedIn) router.replace("/plan");
  }, [osm?.loggedIn, router]);

  return (
    <main className="bg-paper font-body text-ink relative flex h-screen w-screen items-center justify-center overflow-hidden">
      <AddToHomescreenPrompt />
      <Link
        href="/"
        className="border-paper-line bg-paper/80 font-display absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border px-4 py-2 text-lg font-bold tracking-tight backdrop-blur md:top-5 md:left-5"
      >
        <span className="bg-sky-deep inline-block h-2.5 w-2.5 animate-pulse rounded-full" />
        Legwork Maps
      </Link>
      <section className="border-paper-line bg-paper-deep/95 flex w-full max-w-md flex-col gap-5 rounded-3xl border p-8 shadow-2xl backdrop-blur-md">
        <div className="flex flex-col gap-2">
          <span className="text-sky-deep text-xs font-semibold tracking-wide uppercase">
            Sign in required
          </span>
          <h1 className="font-display text-3xl leading-tight font-bold">
            Connect your OpenStreetMap account
          </h1>
          <p className="text-ink-dim text-sm">
            The planner edits real OSM data. Sign in with your OpenStreetMap account to open the map
            and start building routes.
          </p>
        </div>
        <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft flex items-center justify-center gap-2 rounded-full px-5 py-3 font-bold transition">
          Sign in to OpenStreetMap
        </OsmSignInLink>
      </section>
    </main>
  );
}
