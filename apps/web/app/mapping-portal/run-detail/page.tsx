"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, ArrowSquareOutIcon } from "@phosphor-icons/react";
import Panel from "@/components/ui/Panel";
import { SyncBadge } from "@/components/SyncStatus";
import type { MapMarker } from "@/components/MapView";
import { getArchivedRoutes, type ArchivedRoute } from "@/lib/routeArchive";
import { EDIT_LABEL, STATUS_COLOR } from "@/lib/editStatus";
import { fmtDist } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Read-only replay of one archived run: the route line, every stop with its
// recorded status, and the edit-by-edit sync record. Addressed by query param
// (?id=) rather than a dynamic segment so the Capacitor static export can
// serve it too.
function RunDetailContent() {
  const params = useSearchParams();
  const id = params.get("id");
  // undefined = still reading localStorage; null = not found on this device.
  const [route, setRoute] = useState<ArchivedRoute | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setRoute(getArchivedRoutes().find((r) => r.routeId === id) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (route === undefined) {
    return <main className="bg-paper min-h-screen" />;
  }

  if (route === null) {
    return (
      <main className="bg-paper font-body text-ink">
        <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-5 py-8">
          <h1 className="font-display text-2xl font-bold">Run not found</h1>
          <p className="text-ink-dim text-sm">
            This run isn&apos;t in this device&apos;s archive — runs are stored locally on the
            device that recorded them.
          </p>
          <Link href="/mapping-portal" className="text-sky-deep text-sm font-semibold">
            ← Back to your runs
          </Link>
        </div>
      </main>
    );
  }

  const { plan, edits } = route;
  const date = new Date(route.startedAt).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const line: [number, number][] = plan.routeCoords.map(([lon, lat]) => [lat, lon]);
  const markers: MapMarker[] = [
    { id: "start", lat: plan.start.lat, lon: plan.start.lon, color: "#16a34a", label: "⚑" },
    ...plan.stops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      color: STATUS_COLOR[s.status],
      label: EDIT_LABEL[s.status] ?? String(i + 1),
      dimmed: s.status === "skipped",
    })),
  ];
  const fitPoints: [number, number][] = [
    [plan.start.lat, plan.start.lon],
    ...plan.stops.map((s) => [s.lat, s.lon] as [number, number]),
  ];
  const changesetUrl = edits.find((e) => e.changesetUrl)?.changesetUrl;
  const surveyed = plan.stops.filter((s) => s.status !== "pending" && s.status !== "skipped");

  return (
    <main className="bg-paper font-body text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 py-8">
        <Link
          href="/mapping-portal"
          className="text-ink-dim hover:text-ink flex w-fit items-center gap-1.5 text-sm font-semibold transition"
        >
          <ArrowLeftIcon size={14} />
          Your runs
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl leading-tight font-bold">{date}</h1>
          <p className="text-ink-dim text-sm">
            {fmtDist(plan.distanceM)} · {surveyed.length} of {plan.stops.length}{" "}
            {plan.stops.length === 1 ? "stop" : "stops"} surveyed
          </p>
        </div>

        <div className="border-paper-line relative h-[45vh] w-full overflow-hidden rounded-2xl border">
          <MapView
            center={[plan.start.lat, plan.start.lon]}
            zoom={14}
            markers={markers}
            line={line}
            fitPoints={fitPoints.length >= 2 ? fitPoints : undefined}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {changesetUrl && (
          <a
            href={changesetUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sky-deep flex w-fit items-center gap-1.5 text-sm font-semibold"
          >
            <ArrowSquareOutIcon size={14} />
            View the changeset on OpenStreetMap
          </a>
        )}

        {edits.length > 0 && (
          <Panel className="flex flex-col gap-3 p-5">
            <h2 className="font-display text-lg font-bold">Edits</h2>
            <ul className="divide-paper-line flex flex-col divide-y">
              {edits.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{e.name ?? "Unnamed fountain"}</span>
                    <span className="text-ink-dim text-xs">{e.summary}</span>
                  </span>
                  <span className="shrink-0 text-xs">
                    <SyncBadge state={e.syncState} />
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </main>
  );
}

export default function RunDetailPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<main className="bg-paper min-h-screen" />}>
      <RunDetailContent />
    </Suspense>
  );
}
