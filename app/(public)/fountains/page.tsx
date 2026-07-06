"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import type { Fountain } from "@/lib/schemas";
import type { MapMarker } from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import Panel from "@/components/ui/Panel";
import PointPopup from "@/components/PointPopup";
import EditSyncPanel from "@/components/EditSyncPanel";
import OsmSignInLink from "@/components/OsmSignInLink";
import FountainPopup from "@/components/fountains/FountainPopup";
import SearchPanel, { DEFAULT_RADIUS_MI, type Anchor } from "@/components/fountains/SearchPanel";
import { useOsmStatus } from "@/components/OsmStatus";
import { useOsmEdits } from "@/hooks/useOsmEdits";
import { EDIT_COLOR, EDIT_LABEL } from "@/lib/editStatus";
import {
  countBy,
  fountainName,
  rankFountains,
  type Ranked,
  type Recency,
  type Svc,
  type Water,
} from "@/lib/fountainFilters";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { milesToMeters, type Pt } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// We only care about human drinking water for the public view.
const TAG = { key: "amenity", value: "drinking_water" } as const;
// Verified within this window counts as recently checked.
const FRESH_MONTHS = 12;

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
// Neutral dark pin for the dropped search anchor — distinct from fountain colors.
const PIN_COLOR = "#334155";

export default function FountainsPage() {
  // OSM connection gates editing: signed in → points are editable; otherwise the
  // popups stay read-only and the panel offers a connect button.
  const { status: osm } = useOsmStatus();
  // GPS fix (blue dot) — set only when the user asks to locate.
  const [pos, setPos] = useState<Pt | null>(null);
  // Search anchor: the GPS fix or a pin dropped on the map. No anchor until the
  // user picks one; searching with none acquires a GPS fix first.
  const [center, setCenter] = useState<Pt | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Anchor the last successful search actually ran from, so distances keep
  // referring to the results even if the user moves the pin before re-searching.
  const [searchedAt, setSearchedAt] = useState<Pt | null>(null);
  const [recenterKey, setRecenterKey] = useState("init");
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [radiusMi, setRadiusMi] = useState(DEFAULT_RADIUS_MI);
  // Filters: default to in-service only; both water types and all recencies on.
  const [svc, setSvc] = useState<Set<Svc>>(() => new Set<Svc>(["in"]));
  const [water, setWater] = useState<Set<Water>>(() => new Set<Water>(["human", "dog"]));
  const [rec, setRec] = useState<Set<Recency>>(() => new Set<Recency>(["fresh", "stale", "never"]));

  // Direct OSM edits made from the map (signed in only). Backed by the offline
  // outbox: saved on-device first, sent to OSM in the background.
  const osmEdits = useOsmEdits({ tagKey: TAG.key, onError: setErr });
  const { edits, updatePoint } = osmEdits;

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

  // Fetch the drinking-water points around the anchor; with no anchor yet, fall
  // back to acquiring the GPS fix first. We ask for out-of-service variants too
  // so the Service filter has something to reveal.
  const search = useCallback(async () => {
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
          radiusM: milesToMeters(radiusMi),
          tag: TAG,
          recencyMode: "any",
          includeDisused: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        const e = j.error;
        throw new Error(
          e?.message || (typeof e === "string" ? e : "") || "Couldn't load fountains.",
        );
      }
      setFountains(j.fountains as Fountain[]);
      setSearchedAt(at);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [center, radiusMi, locate]);

  // Dropping a pin moves the search anchor; results refresh on the next search.
  const dropPin = useCallback((lat: number, lon: number) => {
    setCenter({ lat, lon });
    setAnchor("pin");
  }, []);

  const ranked = useMemo<Ranked[]>(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - FRESH_MONTHS);
    return rankFountains(fountains, searchedAt, cutoff.getTime());
  }, [fountains, searchedAt]);

  const counts = useMemo(() => countBy(ranked), [ranked]);

  const visible = useMemo(
    () => ranked.filter((r) => svc.has(r.svc) && water.has(r.water) && rec.has(r.rec)),
    [ranked, svc, water, rec],
  );

  const loggedIn = !!osm?.loggedIn;

  const markers: MapMarker[] = useMemo(() => {
    const ms: MapMarker[] = visible.map(({ f, distM, svc: s, water: w }) => {
      const base = s === "out" ? "#9ca3af" : w === "dog" ? "#7c3aed" : "#0284c7";
      // A point edited this session (only when signed in) takes the edit color +
      // status glyph, and is no longer dimmed.
      const edit = loggedIn ? edits[f.id] : undefined;
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: edit ? (EDIT_COLOR[edit.status] ?? base) : base,
        label: edit ? EDIT_LABEL[edit.status] : undefined,
        dimmed: s === "out" && !edit,
        popup: loggedIn ? (
          <PointPopup
            fountain={f}
            loggedIn
            edit={edit}
            busy={false}
            onAction={(action, extras) => updatePoint(f.id, action, fountainName(f), extras)}
          />
        ) : (
          <FountainPopup f={f} distM={distM} />
        ),
      };
    });
    // The dropped pin itself; a GPS anchor is already marked by the blue dot.
    if (center && anchor === "pin") {
      ms.push({ id: "search-pin", lat: center.lat, lon: center.lon, color: PIN_COLOR });
    }
    return ms;
  }, [visible, center, anchor, loggedIn, edits, updatePoint]);

  const viewCenter: [number, number] = center
    ? [center.lat, center.lon]
    : pos
      ? [pos.lat, pos.lon]
      : DEFAULT_CENTER;

  const head = (
    <div className="flex flex-col gap-4">
      <SearchPanel
        busy={busy}
        err={err}
        searched={searchedAt != null}
        anchor={anchor}
        visibleN={visible.length}
        counts={counts}
        svc={svc}
        setSvc={setSvc}
        water={water}
        setWater={setWater}
        rec={rec}
        setRec={setRec}
        radiusMi={radiusMi}
        onRadiusChange={setRadiusMi}
        onLocate={locate}
        onSearch={search}
      />

      {/* Not connected: tapping a point stays read-only. Offer the OSM connect so
          the same map becomes editable. */}
      {osm && !osm.loggedIn && (
        <div className="border-sky-deep/40 bg-sky/10 flex flex-col gap-2 rounded-lg border p-3 text-sm">
          <span className="text-ink">
            Connect your OpenStreetMap account to record fountain updates from the map.
          </span>
          <OsmSignInLink className="bg-ink text-paper hover:bg-ink-soft w-fit rounded-full px-4 py-1.5 text-xs font-bold transition">
            Connect with OpenStreetMap
          </OsmSignInLink>
        </div>
      )}

      {/* Connected + edited this session: sync review + changeset close. */}
      <EditSyncPanel osmEdits={osmEdits} />
    </div>
  );
  const body = null;

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
      <BottomSheet head={head} body={body} />

      {/* Desktop: right-anchored floating panel. */}
      <div className="pointer-events-none hidden md:absolute md:inset-y-0 md:right-0 md:left-auto md:z-[1000] md:flex md:items-center md:p-6">
        <Panel className="pointer-events-auto flex w-full max-w-sm flex-col gap-4 p-6 md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          {head}
          {body}
        </Panel>
      </div>
    </main>
  );
}
