"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { Fountain } from "@rosm/core/schemas";
import type { MapMarker } from "@/components/MapView";
import type { OsmEdits } from "@/hooks/useOsmEdits";
import AccountChip from "@/components/AccountChip";
import Modal from "@/components/ui/Modal";
import PointPopup from "@/components/PointPopup";
import FountainPopup from "@/components/fountains/FountainPopup";
import SearchPanel, { DEFAULT_RADIUS_MI, type Anchor } from "@/components/fountains/SearchPanel";
import { EDIT_COLOR, EDIT_LABEL } from "@rosm/core/editStatus";
import {
  countBy,
  fountainName,
  rankFountains,
  type Ranked,
  type Recency,
  type Svc,
  type Water,
} from "@rosm/core/fountainFilters";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { milesToMeters, type Pt } from "@rosm/core/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// We only care about human drinking water for this map.
const TAG = { key: "amenity", value: "drinking_water" } as const;
// Verified within this window counts as recently checked.
const FRESH_MONTHS = 12;

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
// Neutral dark pin for the dropped search anchor — distinct from fountain colors.
const PIN_COLOR = "#334155";

type Props = {
  // Present → points are editable (PointPopup + edit overlay). Absent → read-only
  // (FountainPopup only). The parent owns the hook so a read-only map never
  // instantiates the outbox-backed edit machinery.
  editable?: OsmEdits;
  defaultRadiusMi?: number;
  // Floating back link, top-left over the map.
  backHref: string;
  backLabel: string;
  // Page-specific panel content (CTA, sync panel).
  footer?: ReactNode;
  // Optional site navbar rendered above the map (public browser). When present,
  // the floating back link is dropped — the navbar already routes home.
  nav?: ReactNode;
};

// The shared fountain map: full-bleed Leaflet, GPS/pin search anchor, filters,
// and a mobile bottom sheet / desktop side panel. Read-only for the public
// browser; editable for the connected Quick Update surface.
export default function FountainMap({
  editable,
  defaultRadiusMi = DEFAULT_RADIUS_MI,
  backHref,
  backLabel,
  footer,
  nav,
}: Props) {
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
  // Latest settled map view (center + corner-reaching radius), and whether the
  // user has moved the map away from the last search — which surfaces the
  // floating "Search this area" button.
  const [mapView, setMapView] = useState<{ lat: number; lon: number; radiusM: number } | null>(
    null,
  );
  const [showSearchArea, setShowSearchArea] = useState(false);
  // Radius for anchor-based searches (GPS fix / dropped pin). No longer user-
  // editable — panning the map and hitting "Search this area" is the way to widen.
  const defaultRadiusM = milesToMeters(defaultRadiusMi);
  // Filters: default to in-service only; both water types and all recencies on.
  const [svc, setSvc] = useState<Set<Svc>>(() => new Set<Svc>(["in"]));
  const [water, setWater] = useState<Set<Water>>(() => new Set<Water>(["human"]));
  const [rec, setRec] = useState<Set<Recency>>(() => new Set<Recency>(["fresh"]));
  // The search/filter surface. Stays closed until the location-consent gate is
  // resolved, then collapses to a reopen button once a search succeeds.
  const [modalOpen, setModalOpen] = useState(false);
  // Location-consent gate: shown first, before we ever touch the system
  // permission. Only once the user agrees here do we fire the device prompt.
  const [askConsent, setAskConsent] = useState(true);

  // Acquire a GPS fix and make it the search anchor. Does not search — that
  // stays an explicit action. `quiet` skips the loading animation while the
  // system permission prompt is up, so the loader only starts once we hold a fix.
  const locate = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
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
      if (!quiet) setBusy(false);
    }
  }, []);

  // Fetch the drinking-water points around a center; with no anchor yet, fall
  // back to acquiring the GPS fix first. `radiusM` defaults to the anchor radius
  // but "Search this area" passes the current viewport radius. We ask for
  // out-of-service variants too so the Service filter has something to reveal.
  const search = useCallback(
    async (at?: Pt, radiusM: number = defaultRadiusM) => {
      let from = at ?? center;
      if (!from) {
        from = await locate();
        if (!from) return; // locate already surfaced the error
      }
      setBusy(true);
      setErr(null);
      try {
        const r = await apiFetch("/api/fountains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...from,
            radiusM,
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
        setSearchedAt(from);
        // Fresh results match the current view — hide the "search this area" nudge.
        setShowSearchArea(false);
        // Points landed — drop the modal so the map is visible. It reopens on demand.
        setModalOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [center, defaultRadiusM, locate],
  );

  // The map settled after a pan/zoom: remember the view, and if the user drove
  // the move, offer to re-search the now-visible area.
  const onViewChange = useCallback(
    (view: { lat: number; lon: number; radiusM: number }, userInitiated: boolean) => {
      setMapView(view);
      if (userInitiated) setShowSearchArea(true);
    },
    [],
  );

  // Search the currently visible map area (center + corner-reaching radius).
  const searchArea = useCallback(() => {
    if (!mapView) return;
    search({ lat: mapView.lat, lon: mapView.lon }, mapView.radiusM);
  }, [mapView, search]);

  // Consent granted: dismiss the gate, fire the system permission prompt (no
  // loader yet), and only once we hold a fix begin the search — which flips on
  // the loading animation. A denied/failed fix falls back to the search panel.
  const startWithLocation = useCallback(async () => {
    setAskConsent(false);
    const here = await locate(true);
    setModalOpen(true);
    if (here) search(here);
  }, [locate, search]);

  // Consent declined: skip location entirely and open the search panel so the
  // user can drop a pin and search manually.
  const declineLocation = useCallback(() => {
    setAskConsent(false);
    setModalOpen(true);
  }, []);

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

  const markers: MapMarker[] = useMemo(() => {
    const edits = editable?.edits;
    const ms: MapMarker[] = visible.map(({ f, distM, svc: s, water: w }) => {
      const base = s === "out" ? "#9ca3af" : w === "dog" ? "#7c3aed" : "#0284c7";
      // A point edited this session (editable map only) takes the edit color +
      // status glyph, and is no longer dimmed.
      const edit = edits?.[f.id];
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: edit ? (EDIT_COLOR[edit.status] ?? base) : base,
        label: edit ? EDIT_LABEL[edit.status] : undefined,
        dimmed: s === "out" && !edit,
        popup: editable ? (
          <PointPopup
            fountain={f}
            loggedIn
            edit={edit}
            busy={false}
            onAction={(action, extras) =>
              editable.updatePoint(f.id, action, fountainName(f), extras)
            }
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
  }, [visible, center, anchor, editable]);

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
        anchor={anchor}
        counts={counts}
        svc={svc}
        setSvc={setSvc}
        water={water}
        setWater={setWater}
        rec={rec}
        setRec={setRec}
        showFilters={searchedAt !== null}
        onSearch={() => search()}
      />
      {footer}
    </div>
  );

  return (
    <main className="bg-paper font-body text-ink flex h-dvh w-screen flex-col overflow-hidden">
      {nav}

      {/* Map region: fills the space under any navbar, hosting the full-bleed
          Leaflet layer and the floating UI. `isolate` keeps the search modal's
          backdrop (rendered here with `contained`) scoped to this region so the
          blur never reaches the navbar above. */}
      <div className="relative isolate flex-1 overflow-hidden">
        {/* Map: full-bleed under the floating UI at every size. */}
        <div className="absolute inset-0">
          <MapView
            center={viewCenter}
            zoom={15}
            recenterKey={recenterKey}
            markers={markers}
            userPos={pos ? [pos.lat, pos.lon] : undefined}
            onMapClick={dropPin}
            onViewChange={onViewChange}
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {/* Floating controls over the map: back link + account (only without a
          navbar) and the button that reopens the search/filter modal. */}
        <header className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex items-center justify-between p-4 md:p-5">
          {!nav ? (
            <Link
              href={backHref}
              className="border-paper-line bg-paper/90 text-ink-dim hover:text-ink pointer-events-auto flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition"
            >
              <ArrowLeftIcon size={14} />
              {backLabel}
            </Link>
          ) : (
            <span />
          )}
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="border-paper-line bg-paper/90 text-ink hover:text-sky-deep flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition"
            >
              <SlidersHorizontalIcon size={14} />
              Search
            </button>
            {!nav && <AccountChip />}
          </div>
        </header>

        {/* "Search this area": appears once the user pans/zooms away from the
            last search, and re-runs the query over the now-visible viewport. */}
        {showSearchArea && !modalOpen && !askConsent && !busy && (
          <div className="safe-top pointer-events-none absolute inset-x-0 top-14 z-[1000] flex justify-center md:top-16">
            <button
              type="button"
              onClick={searchArea}
              className="border-paper-line bg-paper/95 text-ink hover:text-sky-deep pointer-events-auto flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold shadow-md backdrop-blur transition"
            >
              <MagnifyingGlassIcon size={14} />
              Search this area
            </button>
          </div>
        )}

        {/* Location-consent gate: shown before the system prompt. Agreeing here
            fires the device permission; declining drops into manual pin search. */}
        <Modal open={askConsent} onClose={declineLocation} contained title="Find water near you">
          <div className="flex flex-col gap-4">
            <p className="text-ink-dim text-sm leading-relaxed">
              Share your location to find drinking fountains around you. Your device will ask
              permission next. Nothing is stored or shared.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={startWithLocation}
                className="bg-sky-deep text-ink hover:bg-sky-deep/85 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition"
              >
                <MapPinIcon size={16} />
                Use my location
              </button>
              <button
                type="button"
                onClick={declineLocation}
                className="text-ink-dim hover:text-ink px-3 py-2 text-sm font-semibold transition"
              >
                Not now — I&apos;ll drop a pin
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          dismissible={!busy}
          contained
          title="Find drinking water"
        >
          {head}
        </Modal>
      </div>
    </main>
  );
}
