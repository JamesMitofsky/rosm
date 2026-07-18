"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  MagnifyingGlassIcon,
  MagnifyingGlassPlusIcon,
  MapPinIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";
import type { EditExtras, Fountain } from "@/lib/schemas";
import type { MapMarker } from "@/components/MapView";
import type { OsmEdits } from "@/hooks/useOsmEdits";
import AccountChip from "@/components/AccountChip";
import AddPointPopup from "@/components/AddPointPopup";
import MapSearchBar from "@/components/MapSearchBar";
import BusyPill from "@/components/ui/BusyPill";
import Modal from "@/components/ui/Modal";
import PointPopup from "@/components/PointPopup";
import FountainPopup from "@/components/fountains/FountainPopup";
import SearchPanel, { DEFAULT_SEARCH_SPAN_MI } from "@/components/fountains/SearchPanel";
import { EDIT_COLOR, EDIT_LABEL } from "@/lib/editStatus";
import { ptLabel } from "@/lib/pointTypes";
import { countBy, rankFountains, type Ranked, type Water } from "@/lib/fountainFilters";
import { BUCKET_COLOR, bucketOf } from "@/components/FreshnessLegend";
import { apiFetch } from "@/lib/api";
import {
  GeoError,
  getCurrentPosition,
  hasLocationPermission,
  type GeoErrorReason,
} from "@/lib/geolocation";
import { useLiveLocation } from "@/lib/useLiveLocation";
import CompassEnableModal from "@/components/run/CompassEnableModal";
import { boxAround, boxAspect, milesToMeters, MAX_SEARCH_RADIUS_M, type Pt } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// We only care about human drinking water for this map.
const TAG = { key: "amenity", value: "drinking_water" } as const;

// One message per acquisition-failure cause, so "allow location access" only
// shows when permission is actually the problem (a GPS-less device failing to
// get a fix used to be blamed on permissions).
const LOCATE_ERROR: Record<GeoErrorReason, string> = {
  denied:
    "Location access is blocked for this site. Enable it in your browser or device settings, " +
    "or move the map and search the visible area instead.",
  unavailable:
    "Your device couldn't determine its position. Move the map and search the visible area instead.",
  timeout:
    "Getting your location took too long. Try again, or move the map and search the visible area.",
  insecure:
    "Location only works over a secure (https) connection. Move the map and search the visible area instead.",
  unknown:
    "Couldn't get your location. Allow location access, or move the map and search the visible area instead.",
};

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];

type Props = {
  // Present → points are editable (PointPopup + edit overlay). Absent → read-only
  // (FountainPopup only). The parent owns the hook so a read-only map never
  // instantiates the outbox-backed edit machinery.
  editable?: OsmEdits;
  defaultSpanMi?: number;
  // Page-specific panel content (CTA, sync panel).
  footer?: ReactNode;
  // Optional site navbar rendered above the map (public browser). When present,
  // the map skips its own floating Exit chip — the navbar already routes home.
  nav?: ReactNode;
};

// The shared fountain map: full-bleed Leaflet, GPS or map-area search, filters,
// and a mobile bottom sheet / desktop side panel. Read-only for the public
// browser; editable for the connected Quick Update surface.
export default function FountainMap({
  editable,
  defaultSpanMi = DEFAULT_SEARCH_SPAN_MI,
  footer,
  nav,
}: Props) {
  // One-shot GPS fix used as the search anchor (and the map's initial recenter
  // target). The live blue dot rides on `useLiveLocation` below — this stays put
  // so distances keep referring to where the search actually ran from.
  const [pos, setPos] = useState<Pt | null>(null);
  // Live location: armed once the user has opted into location (consent granted
  // or already-granted on mount). Drives the moving blue dot + heading cone, the
  // same treatment the run screen gets.
  const [locationEnabled, setLocationEnabled] = useState(false);
  const {
    pos: livePos,
    heading,
    needsCompassPermission,
    requestCompass,
  } = useLiveLocation({ enabled: locationEnabled });
  // Search anchor: the GPS fix, if the user granted one. Searching with none
  // acquires a GPS fix first; otherwise searches come from the visible area.
  const [center, setCenter] = useState<Pt | null>(null);
  // Point the last successful search actually ran from, so distances keep
  // referring to the results even if the map moves before re-searching.
  const [searchedAt, setSearchedAt] = useState<Pt | null>(null);
  // Box covering the area the last search actually spanned — drawn on the map,
  // dimming everything outside it.
  const [searchedBox, setSearchedBox] = useState<[[number, number], [number, number]] | null>(null);
  const [recenterKey, setRecenterKey] = useState("init");
  // Whether the pending recenter should animate (flyTo). Only a search pick
  // sets this; GPS/init recenters stay instant.
  const [animateRecenter, setAnimateRecenter] = useState(false);
  const [fountains, setFountains] = useState<Fountain[]>([]);
  // "Now" snapshot captured at fetch time, so freshness bucketing stays pure
  // across re-renders (Date.now() may not run during render).
  const [nowMs, setNowMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Latest settled map view (center + corner-reaching radius), and whether the
  // user has moved the map away from the last search — which surfaces the
  // floating "Search this area" button.
  const [mapView, setMapView] = useState<{
    lat: number;
    lon: number;
    radiusM: number;
    bounds: [[number, number], [number, number]];
  } | null>(null);
  // Set when a just-acquired GPS fix is waiting for the map to recenter. The
  // recenter settles into an `onViewChange` carrying the real post-jump viewport
  // bounds, which then fires the first search — so the queried rectangle (and
  // drawn box) is exactly the viewport, with no race against the map's load.
  const pendingLocateSearch = useRef(false);
  const [showSearchArea, setShowSearchArea] = useState(false);
  // A "Search this area" request is in flight — keeps that button mounted with a
  // spinner (rather than the generic full-screen busy path hiding it).
  const [areaBusy, setAreaBusy] = useState(false);
  // Box half-extent for GPS/pin searches. No longer user-editable — panning the
  // map and hitting "Search this area" is the way to widen.
  const defaultSpanM = milesToMeters(defaultSpanMi);
  // Filter: default to human water. Service status is no longer a filter —
  // out-of-service points always show, dimmed + gray. Verification age isn't a
  // filter either; it's shown on the map via marker color.
  const [water, setWater] = useState<Set<Water>>(() => new Set<Water>(["human"]));
  // The search/filter surface. Stays closed until the location-consent gate is
  // resolved, then collapses to a reopen button once a search succeeds.
  const [modalOpen, setModalOpen] = useState(false);
  // Location-consent gate: shown before we ever touch the system permission, but
  // only when access isn't already granted (see the mount effect below). Starts
  // closed so we don't flash it while the permission check is in flight.
  const [askConsent, setAskConsent] = useState(false);
  // Nodes created this session via tap-to-add, so their markers read as "+"
  // (they're regular fountains otherwise — appended to the result set above).
  const [createdIds, setCreatedIds] = useState<ReadonlySet<number>>(() => new Set());

  // Acquire a GPS fix and make it the search anchor. Does not search — that
  // stays an explicit action. `quiet` skips the loading animation while the
  // system permission prompt is up, so the loader only starts once we hold a fix.
  const locate = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    setErr(null);
    try {
      const p = await getCurrentPosition().catch((e: unknown) => {
        throw new Error(LOCATE_ERROR[e instanceof GeoError ? e.reason : "unknown"]);
      });
      const here = { lat: p.lat, lon: p.lon };
      setPos(here);
      setCenter(here);
      setAnimateRecenter(false);
      setRecenterKey(`${here.lat},${here.lon}`);
      return here;
    } catch (e) {
      setErr((e as Error).message);
      return null;
    } finally {
      if (!quiet) setBusy(false);
    }
  }, []);

  // Fetch the drinking-water points in a rectangle around a center; with no
  // anchor yet, fall back to acquiring the GPS fix first. `spanM` is the box
  // half-extent for a GPS/pin search (ignored when "Search this area" supplies
  // its own `box`). We ask for out-of-service variants too so the Service filter
  // has something to reveal.
  const search = useCallback(
    async (at?: Pt, spanM: number = defaultSpanM, box?: [[number, number], [number, number]]) => {
      let from = at ?? center;
      if (!from) {
        from = await locate();
        if (!from) return; // locate already surfaced the error
      }
      setBusy(true);
      setErr(null);
      // Every search queries a rectangle. "Search this area" passes the viewport
      // box; a GPS/pin search derives one around the fix, sized to `spanM` and
      // shaped to the viewport aspect (landscape → wider, not a square). Draw it
      // up front so the gray dimming box appears the moment the search fires, not
      // after the request lands — results can never spill past the drawn box.
      const aspect = mapView ? boxAspect(mapView.bounds) : 1;
      const queryBox = box ?? boxAround(from, spanM, aspect);
      setSearchedBox(queryBox);
      try {
        const region = {
          bounds: [queryBox[0][0], queryBox[0][1], queryBox[1][0], queryBox[1][1]] as [
            number,
            number,
            number,
            number,
          ],
        };
        const r = await apiFetch("/api/fountains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...region,
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
        setNowMs(Date.now());
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
    [center, defaultSpanM, locate, mapView],
  );

  // A map-driven search ("Search this area"). Keeps a dedicated spinner
  // mounted over the map for its duration, distinct from the modal's busy
  // path, so the user sees the request they just triggered is in flight.
  const runAreaSearch = useCallback(
    async (at: Pt, spanM?: number, box?: [[number, number], [number, number]]) => {
      setAreaBusy(true);
      try {
        await search(at, spanM, box);
      } finally {
        setAreaBusy(false);
      }
    },
    [search],
  );

  // Search the currently visible map area (center + corner-reaching radius).
  const searchArea = useCallback(() => {
    if (!mapView || mapView.radiusM > MAX_SEARCH_RADIUS_M) return;
    runAreaSearch({ lat: mapView.lat, lon: mapView.lon }, mapView.radiusM, mapView.bounds);
  }, [mapView, runAreaSearch]);

  // The map settled after load, a recenter, or a pan/zoom: remember the view. A
  // pending GPS locate fires its first search here, off the freshly-settled
  // viewport (post-recenter), so the queried box matches the screen exactly. A
  // user-driven move instead offers to re-search the now-visible area.
  const onViewChange = useCallback(
    (
      view: {
        lat: number;
        lon: number;
        radiusM: number;
        bounds: [[number, number], [number, number]];
      },
      userInitiated: boolean,
    ) => {
      setMapView(view);
      if (pendingLocateSearch.current) {
        pendingLocateSearch.current = false;
        const anchor = { lat: view.lat, lon: view.lon };
        // Within the max span → query the exact viewport box. Zoomed out past it
        // → fall back to a default-sized box around the fix rather than sweeping
        // too much OSM data.
        if (view.radiusM <= MAX_SEARCH_RADIUS_M) {
          runAreaSearch(anchor, view.radiusM, view.bounds);
        } else {
          runAreaSearch(anchor);
        }
        return;
      }
      if (userInitiated) setShowSearchArea(true);
    },
    [runAreaSearch],
  );

  // Consent granted: dismiss the gate, fire the system permission prompt (no
  // loader yet), and once we hold a fix drop straight into the map with the
  // "Searching…" pill — no filters modal in the way. A denied/failed fix falls
  // back to the search panel so the error is visible.
  const startWithLocation = useCallback(async () => {
    setAskConsent(false);
    // Arm the live watch (moving dot + heading). Both entry points into location
    // — the consent accept and the already-granted mount check — flow through
    // here, so this is the single place the watch turns on.
    setLocationEnabled(true);
    const here = await locate(true);
    if (!here) {
      setModalOpen(true);
      return;
    }
    // `locate` recentered the map on the fix (jumpTo keeps the current zoom). Arm
    // the search so the recenter's settled `onViewChange` runs it off the actual
    // post-jump viewport — the queried rectangle (and drawn box) then matches the
    // screen exactly, with no dependence on whether the map had settled yet.
    pendingLocateSearch.current = true;
  }, [locate]);

  // Consent declined: skip location entirely and leave the map interactive so
  // the user can pan to where they care about. Surface the "Search this area"
  // button right away — with no GPS, the visible area is the only way to search.
  const declineLocation = useCallback(() => {
    setAskConsent(false);
    setShowSearchArea(true);
  }, []);

  // On mount, skip the consent gate when the OS has already granted location —
  // re-asking a user who agreed once is pointless. Otherwise show the gate.
  // Fires once; startWithLocation reads later map state through its own closure.
  const consentCheckAlive = useRef(true);
  useEffect(() => {
    consentCheckAlive.current = true;
    hasLocationPermission().then((granted) => {
      if (!consentCheckAlive.current) return;
      if (granted) startWithLocation();
      else setAskConsent(true);
    });
    return () => {
      consentCheckAlive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump the map to a geocoded place. Recenters and surfaces "Search this area"
  // so the user can pull fountains for wherever they landed.
  const goTo = useCallback((at: Pt) => {
    setCenter(at);
    setAnimateRecenter(true);
    setRecenterKey(`${at.lat},${at.lon}`);
    setShowSearchArea(true);
  }, []);

  // Tap-to-add (editable map only): create a new drinking-water node at the
  // tapped spot and drop it straight into the result set so it renders like any
  // other fountain — check_date is today, so it reads as freshly verified.
  const addPoint = useCallback(
    async (at: Pt, extras?: EditExtras) => {
      // Undo (5s toast) deletes the node on OSM again — mirror that locally.
      const f = await editable?.createPoint(at, TAG, extras, (nodeId) => {
        setFountains((cur) => cur.filter((c) => c.id !== nodeId));
        setCreatedIds((cur) => new Set([...cur].filter((id) => id !== nodeId)));
      });
      if (!f) return; // createPoint already surfaced the error
      setFountains((cur) => [...cur, f]);
      setCreatedIds((cur) => new Set(cur).add(f.id));
    },
    [editable],
  );

  const ranked = useMemo<Ranked[]>(
    () => rankFountains(fountains, searchedAt),
    [fountains, searchedAt],
  );

  const counts = useMemo(() => countBy(ranked), [ranked]);

  const visible = useMemo(() => ranked.filter((r) => water.has(r.water)), [ranked, water]);

  const markers: MapMarker[] = useMemo(() => {
    const edits = editable?.edits;
    const ms: MapMarker[] = visible.map(({ f, distM, svc: s }) => {
      // Hue encodes verification freshness (green <1y → amber 1–3y → rose >3y).
      // Out-of-service points stay gray + dimmed — freshness is moot when unusable.
      const base = s === "out" ? "#9ca3af" : BUCKET_COLOR[bucketOf(f.tags, nowMs)];
      // A point edited this session (editable map only) takes the edit color +
      // status glyph, and is no longer dimmed. A node created this session gets
      // the confirm green + a "+" glyph, matching the run map's added markers.
      const edit = edits?.[f.id];
      const created = createdIds.has(f.id);
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: edit ? (EDIT_COLOR[edit.status] ?? base) : created ? "#16a34a" : base,
        label: edit ? EDIT_LABEL[edit.status] : created ? "+" : undefined,
        dimmed: s === "out" && !edit,
        popup: editable ? (
          <PointPopup
            fountain={f}
            loggedIn
            edit={edit}
            busy={false}
            onAction={(action, extras) => editable.updatePoint(f.id, action, undefined, extras)}
          />
        ) : (
          <FountainPopup f={f} distM={distM} />
        ),
      };
    });
    return ms;
  }, [visible, editable, nowMs, createdIds]);

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
        counts={counts}
        water={water}
        setWater={setWater}
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
            animateRecenter={animateRecenter}
            markers={markers}
            searchedBox={searchedBox ?? undefined}
            userPos={livePos ?? (pos ? [pos.lat, pos.lon] : undefined)}
            userHeading={heading}
            followHeading={false}
            onViewChange={onViewChange}
            mapClickPopup={
              editable
                ? (pt, close) => (
                    <AddPointPopup
                      label={ptLabel(TAG.key, TAG.value)}
                      onAdd={async (extras) => {
                        await addPoint(pt, extras);
                        close();
                      }}
                    />
                  )
                : undefined
            }
            className="absolute inset-0 h-full w-full"
          />
        </div>

        {/* iOS compass grant — only once location is armed and the consent gate
            is out of the way, so it doesn't stack on top of that dialog. */}
        {locationEnabled && !askConsent && (
          <CompassEnableModal open={needsCompassPermission} onEnable={requestCompass} />
        )}

        {/* Floating controls over the map. Absolutely-placed container; the
            affordances inside flow relatively (flex column) so the header row
            and any status pill stack instead of overlapping. */}
        <div className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex flex-col gap-3 p-4 md:p-5">
          {/* Header: the Exit chip pinned far left, then the query controls
              (place search + filters). When a site navbar is present it owns the
              exit, so the map drops its own chip. */}
          <header className="flex items-start gap-2">
            {!nav && (
              <div className="pointer-events-auto flex items-center gap-2">
                <AccountChip chipTone="neutral" size="sm" label="Exit" />
              </div>
            )}
            <div className="pointer-events-auto flex items-start gap-2">
              <MapSearchBar onResult={goTo} />
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="border-paper-line bg-paper/90 text-ink hover:text-sky-deep flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition"
              >
                <SlidersHorizontalIcon size={14} />
                Filters
              </button>
            </div>
          </header>

          {/* Map-driven search in flight ("Search this area"): a spinner pill
              sits where that affordance was, confirming the request landed. */}
          {areaBusy && !modalOpen && !askConsent && (
            <div className="flex justify-center">
              <BusyPill label="Searching…" />
            </div>
          )}

          {/* "Search this area": appears once the user pans/zooms away from the
              last search (or immediately after declining location), and runs the
              query over the now-visible viewport.
              When the viewport is zoomed out past the max search span, the query
              would sweep too much OSM data, so the button becomes a zoom-in prompt
              instead. The threshold is a real-world distance (viewport center→
              corner), so it reads the same on every screen size. */}
          {showSearchArea &&
            !modalOpen &&
            !askConsent &&
            !busy &&
            (mapView && mapView.radiusM > MAX_SEARCH_RADIUS_M ? (
              <div className="flex justify-center">
                <span className="pointer-events-auto flex cursor-default items-center gap-1.5 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white shadow-md">
                  <MagnifyingGlassPlusIcon size={16} />
                  Zoom in to search
                </span>
              </div>
            ) : (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={searchArea}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:opacity-90"
                >
                  <MagnifyingGlassIcon size={16} />
                  Search this area
                </button>
              </div>
            ))}
        </div>

        {/* Location-consent gate: shown before the system prompt. Agreeing here
            fires the device permission; declining drops into map-area search. */}
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
                Not now — I&apos;ll search the map
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          dismissible={!busy}
          contained
          title="Filters"
        >
          {head}
        </Modal>
      </div>
    </main>
  );
}
