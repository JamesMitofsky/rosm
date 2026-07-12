"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, PathIcon, DropIcon, CircleNotchIcon } from "@phosphor-icons/react";
import SiteNav from "@/components/SiteNav";
import SyncStatus from "@/components/SyncStatus";
import AccountCard from "@/components/connected/AccountCard";
import ContributionStats from "@/components/connected/ContributionStats";
import RunHistoryList from "@/components/connected/RunHistoryList";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { getArchivedRoutes, type ArchivedRoute } from "@rosm/core/routeArchive";

// The mapping portal: the connected home. Big header + the primary actions as
// on-page buttons (this page carries its own navigation, there is no navbar),
// then who they are on OSM, their contribution totals, and every past run on
// this device. Deliberately NOT gated behind sign-in — the archive and the
// outbox live on the device and are worth showing either way.
export default function MappingPortalPage() {
  const { status } = useOsmStatus();
  const [routes, setRoutes] = useState<ArchivedRoute[]>([]);

  // The archive lives in localStorage, so read it after mount (deferred off the
  // effect body so the state update doesn't cascade-render synchronously).
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) setRoutes(getArchivedRoutes());
    });
    return () => {
      alive = false;
    };
  }, []);

  // `status === null` = still resolving whether the user is signed in. Show only
  // a spinner until we know, so neither the connected nor the connect view flashes
  // before we can pick the right one.
  if (!status) {
    return (
      <>
        <SiteNav />
        <main className="bg-paper font-body text-ink min-h-screen">
          <div className="mx-auto flex max-w-2xl items-center justify-center px-5 py-24">
            <CircleNotchIcon size={28} weight="bold" className="text-ink-dim animate-spin" />
          </div>
        </main>
      </>
    );
  }

  // Not connected → nothing but the header and a connect button. The portal's
  // actions all lead to OSM edits, so gate the whole thing behind sign-in.
  if (!status.loggedIn) {
    return (
      <>
        <SiteNav />
        <main className="bg-paper font-body text-ink min-h-screen">
          <div className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10">
            <header className="flex flex-col gap-2">
              <h1 className="font-display text-4xl leading-none font-bold tracking-tight sm:text-5xl">
                Mapping Portal
              </h1>
              <p className="text-ink-dim text-sm">
                Connect your OpenStreetMap account to survey and fix the map.
              </p>
            </header>
            <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft w-fit rounded-sm px-5 py-2 text-sm font-bold transition">
              Connect with OpenStreetMap
            </OsmSignInLink>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="bg-paper font-body text-ink min-h-screen">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10">
          <header className="flex flex-col gap-2">
            <h1 className="font-display text-4xl leading-none font-bold tracking-tight sm:text-5xl">
              Mapping Portal
            </h1>
          </header>

          {/* Primary actions — the page's own navigation. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/mapping-portal/plan"
              className="group border-paper-line hover:border-ink flex flex-1 items-center gap-3 rounded-lg border p-4 transition"
            >
              <PathIcon size={22} weight="bold" className="text-sky-deep shrink-0" />
              <span className="flex flex-col">
                <span className="font-display font-bold">Plan a route</span>
                <span className="text-ink-dim text-xs">Build a run past unverified points</span>
              </span>
              <ArrowRightIcon
                size={16}
                weight="bold"
                className="text-ink-dim ml-auto shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
            <Link
              href="/mapping-portal/quick-update"
              className="group border-paper-line hover:border-ink flex flex-1 items-center gap-3 rounded-lg border p-4 transition"
            >
              <DropIcon size={22} weight="bold" className="text-sky-deep shrink-0" />
              <span className="flex flex-col">
                <span className="font-display font-bold">Quick Update</span>
                <span className="text-ink-dim text-xs">Record fountains near you</span>
              </span>
              <ArrowRightIcon
                size={16}
                weight="bold"
                className="text-ink-dim ml-auto shrink-0 transition-transform group-hover:translate-x-1"
              />
            </Link>
          </div>

          <hr className="border-paper-line/60" />

          <ContributionStats routes={routes} />

          {/* Outbox review: a self-contained card, so it stays out of the text
              divide-y list — the container's gap-8 gives it space above/below
              instead of the divider hugging its top edge. Renders nothing when empty. */}
          <SyncStatus tone="light" />

          <div className="divide-paper-line/60 flex flex-col divide-y [&>*]:py-8 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
            <RunHistoryList routes={routes} />
            <AccountCard />
          </div>
        </div>
      </main>
    </>
  );
}
