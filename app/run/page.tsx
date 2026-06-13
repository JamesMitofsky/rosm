"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircleIcon,
  WarningIcon,
  TrashIcon,
  ArrowUpIcon,
  SkipForwardIcon,
  FlagCheckeredIcon,
} from "@phosphor-icons/react";
import { useRun, type StopStatus } from "@/store/run";
import { bearing, compass, fmtDist, haversine, type Pt } from "@/lib/geo";
import type { MapMarker } from "@/components/MapView";
import type { EditAction } from "@/lib/schemas";
import OsmStatusBar, { useOsmStatus } from "@/components/OsmStatus";
import ExportButton from "@/components/ExportButton";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const STATUS_COLOR: Record<StopStatus, string> = {
  pending: "#9ca3af",
  confirm: "#16a34a",
  out_of_order: "#d97706",
  removed: "#dc2626",
  delete: "#dc2626",
  skipped: "#6b7280",
};

export default function RunPage() {
  const router = useRouter();
  const run = useRun();
  const { status: osm, refresh } = useOsmStatus();

  const [pos, setPos] = useState<Pt | null>(null);
  const [arrived, setArrived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  // Last successful per-tap write, shown until the next action.
  const [lastSaved, setLastSaved] = useState<{
    nodeId: number;
    newVersion: number;
    summary: string;
    changesetUrl: string;
  } | null>(null);
  // Finish/close-changeset state.
  const [finishing, setFinishing] = useState(false);
  const [finishErr, setFinishErr] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ changesetUrl?: string } | null>(null);

  // Hydrate from saved run if store empty (reload / direct nav).
  useEffect(() => {
    if (run.hasPlan) {
      setHydrating(false);
      return;
    }
    fetch("/api/run")
      .then((r) => r.json())
      .then((plan) => {
        if (plan && plan.stops?.length) run.hydrate(plan);
        else router.replace("/");
      })
      .finally(() => setHydrating(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live position.
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => setErr(`Location: ${e.message}`),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const { stops, index, loop, tagKey } = run;
  const target = stops[index];
  const done = run.hasPlan && index >= stops.length;

  const distToTarget = pos && target ? haversine(pos, target) : null;
  const bearingTo = pos && target ? bearing(pos, target) : 0;

  // Auto-arm "arrived" within 30 m.
  useEffect(() => {
    if (distToTarget != null && distToTarget < 30) setArrived(true);
  }, [distToTarget]);

  async function persist(nextIndex: number, changesetId?: number) {
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: run.start,
        loop,
        tagKey,
        stops: useRun.getState().stops,
        vias: run.vias,
        routeCoords: run.routeCoords,
        distanceM: run.distanceM,
        index: nextIndex,
        changesetId: changesetId ?? run.changesetId,
      }),
    });
  }

  function advance() {
    const ni = index + 1;
    run.setIndex(ni);
    setArrived(false);
    persist(ni);
  }

  async function record(action: EditAction) {
    if (!target) return;
    if (!osm?.loggedIn) {
      setErr("Sign in to OSM first.");
      return;
    }
    setBusy(true);
    setErr(null);
    setLastSaved(null);
    try {
      const r = await fetch("/api/osm/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: target.id, action, tagKey, changesetId: run.changesetId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "edit failed");
      run.setChangeset(j.changesetId);
      run.setStatus(target.id, action as StopStatus);
      setLastSaved({
        nodeId: j.nodeId,
        newVersion: j.newVersion,
        summary: j.summary,
        changesetUrl: j.changesetUrl,
      });
      await persist(index + 1, j.changesetId);
      advance();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    setLastSaved(null);
    if (target) run.setStatus(target.id, "skipped");
    advance();
  }

  async function finish() {
    setFinishing(true);
    setFinishErr(null);
    try {
      if (run.changesetId) {
        const r = await fetch("/api/osm/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changesetId: run.changesetId }),
        });
        const j = await r.json();
        if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
        setClosed({ changesetUrl: j.changesetUrl });
      } else {
        setClosed({});
      }
    } catch (e) {
      setFinishErr((e as Error).message);
    } finally {
      setFinishing(false);
    }
  }

  function goHome() {
    run.reset();
    router.push("/");
  }

  const line: [number, number][] = useMemo(
    () => run.routeCoords.map(([lon, lat]) => [lat, lon]),
    [run.routeCoords],
  );

  const markers: MapMarker[] = useMemo(() => {
    const stopMarkers: MapMarker[] = stops.map((s, i) => ({
      id: s.id,
      lat: s.lat,
      lon: s.lon,
      color: i === index && s.status === "pending" ? "#2563eb" : STATUS_COLOR[s.status],
      label: String(i + 1),
    }));
    const viaMarkers: MapMarker[] = run.vias.map((v, i) => ({
      id: `via-${i}`,
      lat: v.lat,
      lon: v.lon,
      color: "#7c3aed",
      label: "✦",
    }));
    return [...stopMarkers, ...viaMarkers];
  }, [stops, index, run.vias]);

  if (hydrating) return <main className="grid min-h-screen place-items-center text-neutral-400">Loading…</main>;

  if (done) {
    const counts = stops.reduce<Record<string, number>>((a, s) => {
      a[s.status] = (a[s.status] || 0) + 1;
      return a;
    }, {});
    const editCount =
      (counts.confirm || 0) +
      (counts.out_of_order || 0) +
      (counts.removed || 0) +
      (counts.delete || 0);
    const sealed = closed !== null;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <FlagCheckeredIcon size={56} className="text-green-600" />
        <h1 className="text-2xl font-bold">{sealed ? "Changeset closed" : "Run complete"}</h1>
        <ul className="text-sm text-neutral-600">
          <li>Confirmed: {counts.confirm || 0}</li>
          <li>Out of order: {counts.out_of_order || 0}</li>
          <li>Removed: {(counts.removed || 0) + (counts.delete || 0)}</li>
          <li>Skipped: {counts.skipped || 0}</li>
        </ul>
        {/* JSON backup before submit, per the completion-screen flow. */}
        <ExportButton className="w-full" />

        {sealed ? (
          <>
            {closed?.changesetUrl && (
              <a
                href={closed.changesetUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 underline underline-offset-2"
              >
                View {editCount} {editCount === 1 ? "edit" : "edits"} on OpenStreetMap →
              </a>
            )}
            <button
              onClick={goHome}
              className="w-full rounded bg-neutral-900 py-3 font-semibold text-white"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <button
              onClick={finish}
              disabled={finishing}
              className="w-full rounded bg-neutral-900 py-3 font-semibold text-white disabled:opacity-50"
            >
              {finishing ? "Closing changeset…" : "Close changeset & finish"}
            </button>
            {finishErr && (
              <p className="w-full rounded bg-red-50 p-2 text-sm text-red-700">{finishErr}</p>
            )}
          </>
        )}
      </main>
    );
  }

  const center: [number, number] = pos
    ? [pos.lat, pos.lon]
    : target
      ? [target.lat, target.lon]
      : [run.start.lat, run.start.lon];

  return (
    <main className="flex min-h-screen flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-sm font-semibold">
          Stop {Math.min(index + 1, stops.length)} / {stops.length}
        </span>
        <OsmStatusBar />
      </div>

      <div className="h-[42vh] w-full">
        <MapView
          center={center}
          zoom={16}
          recenterKey={pos ? `${pos.lat.toFixed(4)},${pos.lon.toFixed(4)}` : "t"}
          markers={markers}
          line={line}
          userPos={pos ? [pos.lat, pos.lon] : null}
          className="h-full w-full"
        />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-4 rounded-lg border border-neutral-200 p-4">
              <ArrowUpIcon
                size={40}
                weight="bold"
                style={{ transform: `rotate(${bearingTo}deg)` }}
                className="text-blue-600 transition-transform"
              />
              <div>
                <div className="text-2xl font-bold">
                  {distToTarget != null ? fmtDist(distToTarget) : "—"}
                </div>
                <div className="text-sm text-neutral-500">
                  head {compass(bearingTo)} · {target?.tags?.name || `node ${target?.id}`}
                </div>
              </div>
            </div>

            {target?.tags?.check_date && (
              <p className="text-xs text-neutral-400">Last checked in OSM: {target.tags.check_date}</p>
            )}

            {!osm?.loggedIn && (
              <a
                href="/api/osm/auth"
                className="rounded bg-blue-600 py-2 text-center text-sm font-semibold text-white"
                onClick={() => setTimeout(refresh, 1000)}
              >
                Sign in to OSM to record updates
              </a>
            )}

            {!arrived ? (
              <button
                onClick={() => setArrived(true)}
                className="rounded bg-neutral-900 py-3 font-semibold text-white"
              >
                I&apos;m here — inspect
              </button>
            ) : (
              <div className="grid gap-2">
                <button
                  disabled={busy}
                  onClick={() => record("confirm")}
                  className="flex items-center justify-center gap-2 rounded bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <CheckCircleIcon size={20} /> Working — confirm (set check_date)
                </button>
                <button
                  disabled={busy}
                  onClick={() => record("out_of_order")}
                  className="flex items-center justify-center gap-2 rounded bg-amber-500 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <WarningIcon size={20} /> Out of order (disused:)
                </button>
                <button
                  disabled={busy}
                  onClick={() => record("removed")}
                  className="flex items-center justify-center gap-2 rounded bg-red-600 py-3 font-semibold text-white disabled:opacity-50"
                >
                  <TrashIcon size={20} /> Removed (abandoned:)
                </button>
                <details className="text-sm">
                  <summary className="cursor-pointer text-neutral-500">Advanced</summary>
                  <button
                    disabled={busy}
                    onClick={() => record("delete")}
                    className="mt-2 w-full rounded border border-red-600 py-2 font-medium text-red-600 disabled:opacity-50"
                  >
                    Delete node from OSM (irreversible)
                  </button>
                </details>
              </div>
            )}

            <button onClick={skip} className="flex items-center justify-center gap-1 text-sm text-neutral-500">
              <SkipForwardIcon size={16} /> Skip this one
            </button>
          </motion.div>
        </AnimatePresence>

        {lastSaved && (
          <div className="flex items-center gap-2 rounded bg-green-50 p-2 text-sm text-green-800">
            <CheckCircleIcon size={18} className="shrink-0" />
            <span className="flex-1 text-left">
              Saved · node {lastSaved.nodeId} → v{lastSaved.newVersion} · {lastSaved.summary}
            </span>
            <a
              href={lastSaved.changesetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-2"
            >
              view
            </a>
          </div>
        )}

        {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}

        <ExportButton className="mt-auto" />
      </div>
    </main>
  );
}
