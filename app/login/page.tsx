"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useOsmStatus } from "@/components/OsmStatus";
import OsmSignInLink from "@/components/OsmSignInLink";
import AddToHomescreenPrompt from "@/components/AddToHomescreenPrompt";

// Same shape as the server's isSafeReturnTo (lib/osm.ts, node-only module):
// in-app paths only, no protocol-relative escapes.
function safeReturnTo(p: string | null): string {
  if (p && p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\")) return p;
  return "/mapping-portal/plan";
}

// App-wide sign-in gate. Pages that need an OSM account send users here with
// ?returnTo=<path>; once logged in we bounce them back where they came from.
function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const { status: osm } = useOsmStatus();

  useEffect(() => {
    if (osm?.loggedIn) router.replace(returnTo);
  }, [osm?.loggedIn, router, returnTo]);

  return (
    <main className="bg-paper font-body text-ink relative flex h-screen w-screen items-center justify-center overflow-hidden">
      <AddToHomescreenPrompt />
      <Link
        href="/"
        className="border-paper-line bg-paper/80 font-display absolute top-4 left-4 z-10 flex items-center gap-2 rounded-full border px-4 py-2 text-lg font-bold tracking-tight backdrop-blur md:top-5 md:left-5"
      >
        <span className="bg-sky-deep inline-block h-2.5 w-2.5 animate-pulse rounded-full" />
        Fountain Mapper
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
            Fountain Mapper records real OSM data under your name. Sign in with your OpenStreetMap
            account to continue.
          </p>
        </div>
        <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft flex items-center justify-center gap-2 rounded-sm px-5 py-3 font-bold transition">
          Sign in to OpenStreetMap
        </OsmSignInLink>
        <Link
          href="/auth-explained"
          className="text-ink-dim hover:text-ink text-center text-xs underline underline-offset-4 transition"
        >
          Why sign in through OpenStreetMap?
        </Link>
      </section>
    </main>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<main className="bg-paper h-screen w-screen" />}>
      <LoginContent />
    </Suspense>
  );
}
