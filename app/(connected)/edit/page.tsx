"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  CrosshairIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  SpinnerIcon,
} from "@phosphor-icons/react";
import type { EditAction, EditExtras, Fountain } from "@/lib/schemas";
import type { StopStatus } from "@/store/run";
import type { MapMarker } from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import PointPopup, { type PointEdit } from "@/components/PointPopup";
import SyncStatus from "@/components/SyncStatus";
import OsmSignInLink from "@/components/OsmSignInLink";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOutbox, outboxCounts } from "@/store/outbox";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { milesToMeters, type Pt } from "@/lib/geo";
import { celebratePoint } from "@/lib/confetti";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Default radius to look for points around the search anchor; user can override.
const DEFAULT_RADIUS_MI = 1;
const MIN_RADIUS_MI = 0.1;
const MAX_RADIUS_MI = 25;
const clampRadius = (mi: number) => Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, mi));
// The editable amenity — same tag the planner surveys.
const TAG = { key: "amenity", value: "drinking_water" } as const;

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
// Neutral dark pin for the dropped search anchor — distinct from fountain colors.
const PIN_COLOR = "#334155";

// Marker colors/labels for points already updated in OSM this session — matches
// the planner's palette so an edit reads the same everywhere.
const EDIT_COLOR: Partial<Record<StopStatus, string>> = {
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
};
const EDIT_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "✓",
  dog_only: "🐕",
  out_of_order: "!",
  removed: "✕",
};

// Where the search anchor came from: GPS fix or a pin dropped on the map.
type Anchor = "gps" | "pin";

// Direct map editing, no route required: search an area, tap a point, record its
// real-world state into OSM. Edits ride the same offline-first outbox as the
// planner and the live run.
export default function EditMapPage() {
  const { status: osm } = useOsmStatus();

  // GPS fix (blue dot) — set only when the user asks to locate.
  const [pos, setPos] = useState<Pt | null>(null);
  // Search anchor: the GPS fix or a pin dropped on the map.
  const [center, setCenter] = useState<Pt | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [searched, setSearched] = useState(false);
  const [recenterKey, setRecenterKey] = useState("init");
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [radiusMi, setRadiusMi] = useState(DEFAULT_RADIUS_MI);
  // Local draft so the user can freely type (incl. an empty field) before a
  // clamped number is committed on submit/blur.
  const [radiusDraft, setRadiusDraft] = useState(String(DEFAULT_RADIUS_MI));
  const [closingEdits, setClosingEdits] = useState(false);

  const outboxItems = useOutbox((s) => s.items);
  const outboxChangeset = useOutbox((s) => s.changesetId);

  // Latest queued edit per node, for the marker color/label + popup feedback.
  const edits = useMemo(() => {
    const m: Record<number, PointEdit> = {};
    for (const it of outboxItems) {
      m[it.nodeId] = {
        status: it.action as StopStatus,
        summary: it.summary,
        syncState: it.syncState,
        changesetUrl: it.changesetUrl,
        extras: it.extras,
      };
    }
    return m;
  }, [outboxItems]);

  const commitRadius = () => {
    const n = Number(radiusDraft);
    const next = Number.isFinite(n) && n > 0 ? clampRadius(n) : radiusMi;
    setRadiusDraft(String(next));
    setRadiusMi(next);
    return next;
  };

  // Acquire a GPS fix and make it the search anchor. Does not search — that
  // stays an explicit action.
  const locate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await getCurrentPosition().catch(() => {
        throw new Error(
          "Couldn't get your location. Allow location access, or drop a pin on the map instead.",
        );
      });
      const here = { lat: p.lat, lon: p.lon };
      setPos(here);
      setCenter(here);
      setAnchor("gps");
      setRecenterKey(`${here.lat},${here.lon}`);
      return here;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // Fetch every matching point around the anchor — any recency, including
  // out-of-service ones, since all of them are fair game for an update.
  const search = useCallback(
    async (radius: number) => {
      let at = center;
      if (!at) {
        at = await locate();
        if (!at) return; // locate already surfaced the error
      }
      setBusy(true);
      setErr(null);
      try {
        const r = await apiFetch("/api/fountains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...at,
            radiusM: milesToMeters(radius),
            tag: TAG,
            recencyMode: "any",
            includeDisused: true,
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          const e = j.error;
          throw new Error(
            e?.message || (typeof e === "string" ? e : "") || "Couldn't load points.",
          );
        }
        setFountains(j.fountains as Fountain[]);
        setSearched(true);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [center, locate],
  );

  // Dropping a pin moves the search anchor; results refresh on the next search.
  const dropPin = useCallback((lat: number, lon: number) => {
    setCenter({ lat, lon });
    setAnchor("pin");
  }, []);

  // Record an update straight from the map. Offline-first: queued on-device and
  // celebrated immediately, then sent to OSM in the background. Edits batch into
  // one changeset (opened by the API on the first successful send).
  function updatePoint(nodeId: number, action: EditAction, name?: string, extras?: EditExtras) {
    setErr(null);
    useOutbox.getState().enqueue({ nodeId, action, tagKey: TAG.key, name, extras });
    celebratePoint();
    useOutbox.getState().flush();
  }

  // Close the open edit changeset so it's not left dangling on OSM.
  async function closeEdits() {
    const changesetId = useOutbox.getState().changesetId;
    if (!changesetId) return;
    setClosingEdits(true);
    setErr(null);
    try {
      const r = await apiFetch("/api/osm/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changesetId }),
      });
      const j = await r.json();
      if (!r.ok || j.ok === false) throw new Error(j.error || "close failed");
      useOutbox.getState().setChangeset(undefined);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setClosingEdits(false);
    }
  }

  const editCount = Object.keys(edits).length;
  const outboxUnsent = outboxCounts(outboxItems).unsent;

  const markers: MapMarker[] = useMemo(() => {
    const ms: MapMarker[] = fountains.map((f) => {
      const edit = edits[f.id];
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: edit ? (EDIT_COLOR[edit.status] ?? "#9ca3af") : "#0284c7",
        label: edit ? EDIT_LABEL[edit.status] : undefined,
        popup: (
          <PointPopup
            fountain={f}
            loggedIn={!!osm?.loggedIn}
            edit={edit}
            busy={false}
            onAction={(action, extras) =>
              updatePoint(f.id, action, f.tags.name ?? `mark #${f.id}`, extras)
            }
          />
        ),
      };
    });
    // The dropped pin itself; a GPS anchor is already marked by the blue dot.
    if (center && anchor === "pin") {
      ms.push({ id: "search-pin", lat: center.lat, lon: center.lon, color: PIN_COLOR });
    }
    return ms;
  }, [fountains, edits, osm?.loggedIn, center, anchor]);

  const viewCenter: [number, number] = center
    ? [center.lat, center.lon]
    : pos
      ? [pos.lat, pos.lon]
      : DEFAULT_CENTER;

  // Panel content, shared by the mobile bottom sheet and the desktop side panel.
  const head = (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display flex items-center gap-2 text-xl leading-tight font-bold">
            <PencilSimpleIcon size={22} weight="duotone" className="text-sky-deep" />
            Edit the map
          </h1>
          <p className="text-ink-dim text-sm">
            {searched
              ? "Tap a point on the map to record its real-world state in OpenStreetMap."
              : "Tap the map to drop a pin, or use the locate button, then search for points to update."}
          </p>
        </div>
        <button
          onClick={locate}
          disabled={busy}
          title="Use my location"
          className="border-paper-line bg-paper/40 text-ink hover:border-sky-deep/60 hover:text-sky-deep shrink-0 rounded-lg border px-3 py-2 transition disabled:opacity-40"
        >
          <CrosshairIcon size={18} />
        </button>
      </div>

      {/* Edits write to real OSM data, so surface sign-in up front. */}
      {osm && !osm.loggedIn && (
        <div className="border-sky-deep/40 bg-sky/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <span className="text-ink">
            Editing writes to your OpenStreetMap account — sign in to save updates.
          </span>
          <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft w-fit rounded-full px-4 py-1.5 text-xs font-bold transition">
            Sign in to OpenStreetMap
          </OsmSignInLink>
        </div>
      )}

      {/* Radius + explicit search. Enter in the field commits and searches. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(commitRadius());
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <label
            htmlFor="edit-radius-mi"
            className="text-ink-dim text-[11px] font-semibold tracking-wide uppercase"
          >
            Radius
          </label>
          <input
            id="edit-radius-mi"
            type="number"
            inputMode="decimal"
            min={MIN_RADIUS_MI}
            max={MAX_RADIUS_MI}
            step={0.1}
            value={radiusDraft}
            disabled={busy}
            onChange={(e) => setRadiusDraft(e.target.value)}
            onBlur={commitRadius}
            className="border-paper-line bg-paper/40 text-ink focus:border-sky-deep/60 w-20 rounded-lg border px-2 py-1 text-sm transition outline-none disabled:opacity-40"
          />
          <span className="text-ink-dim text-sm">miles</span>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-sky-deep text-ink hover:bg-sky-deep/85 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-40"
        >
          {busy ? (
            <SpinnerIcon size={16} className="animate-spin" />
          ) : (
            <MagnifyingGlassIcon size={16} />
          )}
          {busy ? "Searching…" : anchor === "pin" ? "Search around pin" : "Search"}
        </button>
      </form>

      {err && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-700">
          <span>{err}</span>
          <button
            onClick={() => search(radiusMi)}
            disabled={busy}
            className="self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}

      {searched && !busy && !err && (
        <span className="bg-sky/15 text-sky-deep w-fit rounded-full px-2 py-0.5 text-xs font-semibold">
          {fountains.length} found
        </span>
      )}

      {editCount > 0 && (
        <div className="flex flex-col gap-2">
          {/* Offline-first review: what reached OSM + retry missed sends. */}
          <SyncStatus tone="light" />
          {outboxChangeset && (
            <button
              onClick={closeEdits}
              disabled={closingEdits || outboxUnsent > 0}
              className="border-paper-line text-ink-dim hover:border-sky-deep/60 hover:text-sky-deep w-full rounded-full border py-1.5 text-xs font-semibold transition disabled:opacity-40"
            >
              {closingEdits ? "Closing changeset…" : "Close changeset"}
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <main className="bg-paper font-body text-ink relative h-dvh w-screen overflow-hidden">
      {/* Map: full-bleed under the floating UI at every size. */}
      <div className="absolute inset-0">
        <MapView
          center={viewCenter}
          zoom={15}
          recenterKey={recenterKey}
          markers={markers}
          circle={
            center
              ? { center: [center.lat, center.lon], radiusM: milesToMeters(radiusMi) }
              : undefined
          }
          userPos={pos ? [pos.lat, pos.lon] : undefined}
          onMapClick={dropPin}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {/* Back link, floating over the map. */}
      <header className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex items-center p-4 md:p-5">
        <Link
          href="/"
          className="border-paper-line bg-paper/90 text-ink-dim hover:text-ink pointer-events-auto flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition"
        >
          <ArrowLeftIcon size={14} />
          Home
        </Link>
      </header>

      {/* Mobile: draggable bottom sheet. */}
      <BottomSheet head={head} body={null} />

      {/* Desktop: right-anchored floating panel. */}
      <div className="pointer-events-none hidden md:absolute md:inset-y-0 md:right-0 md:left-auto md:z-[1000] md:flex md:items-center md:p-6">
        <section className="border-paper-line bg-paper/95 pointer-events-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border p-6 shadow-xl backdrop-blur md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          {head}
        </section>
      </div>
    </main>
  );
}
