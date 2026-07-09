"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftIcon, SlidersHorizontalIcon } from "@phosphor-icons/react";
import type { Fountain } from "@/lib/schemas";
import type { MapMarker } from "@/components/MapView";
import type { OsmEdits } from "@/hooks/useOsmEdits";
import AccountChip from "@/components/AccountChip";
import Modal from "@/components/ui/Modal";
import PointPopup from "@/components/PointPopup";
import FountainPopup from "@/components/fountains/FountainPopup";
import SearchPanel, { DEFAULT_RADIUS_MI, type Anchor } from "@/components/fountains/SearchPanel";
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
  const [radiusMi, setRadiusMi] = useState(defaultRadiusMi);
  // Filters: default to in-service only; both water types and all recencies on.
  const [svc, setSvc] = useState<Set<Svc>>(() => new Set<Svc>(["in"]));
  const [water, setWater] = useState<Set<Water>>(() => new Set<Water>(["human"]));
  const [rec, setRec] = useState<Set<Recency>>(() => new Set<Recency>(["fresh"]));
  // The search/filter surface opens as a full-screen modal on mount and stays up
  // while points load; it collapses to a reopen button once a search succeeds.
  const [modalOpen, setModalOpen] = useState(true);

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
  const search = useCallback(
    async (at?: Pt) => {
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
        setSearchedAt(from);
        // Points landed — drop the modal so the map is visible. It reopens on demand.
        setModalOpen(false);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [center, radiusMi, locate],
  );

  // On mount, request a GPS fix once and search from it as soon as access is
  // granted. A denied/failed fix leaves search available via the button.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    locate().then((here) => {
      if (here) search(here);
    });
  }, [locate, search]);

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
        radiusMi={radiusMi}
        onRadiusChange={setRadiusMi}
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
