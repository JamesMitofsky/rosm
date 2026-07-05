"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  CrosshairIcon,
  DropIcon,
  DogIcon,
  MagnifyingGlassIcon,
  SpinnerIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { Fountain } from "@/lib/schemas";
import type { MapMarker } from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { lastCheckedMs } from "@/lib/checkDate";
import { fmtDist, haversine, milesToMeters, type Pt } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// Default radius to look for fountains around the search point; user can override.
const DEFAULT_RADIUS_MI = 1;
// Keep user-entered radius sane before it hits the API / display.
const MIN_RADIUS_MI = 0.1;
const MAX_RADIUS_MI = 25;
const clampRadius = (mi: number) => Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, mi));
const radiusLabel = (mi: number) => `${mi} ${mi === 1 ? "mile" : "miles"}`;
// We only care about human drinking water for the public view.
const TAG = { key: "amenity", value: "drinking_water" } as const;
// Verified within this window counts as recently checked.
const FRESH_MONTHS = 12;

type Svc = "in" | "out";
type Water = "human" | "dog";
// Recency of the last on-the-ground verification (OSM check_date & friends).
type Recency = "fresh" | "stale" | "never";
// Where the search anchor came from: GPS fix or a pin dropped on the map.
type Anchor = "gps" | "pin";
// A fountain with its distance and its filter classifications, precomputed once.
type Ranked = { f: Fountain; distM: number | null; svc: Svc; water: Water; rec: Recency };
type Counts = {
  inN: number;
  outN: number;
  humanN: number;
  dogN: number;
  freshN: number;
  staleN: number;
  neverN: number;
};

// True when OSM tags flag this point as not human-potable (dog water).
function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

// True when OSM lifecycle tags flag this point as no longer in service. This app
// marks a fountain out-of-service by moving `amenity` to `disused:`/`abandoned:`;
// a standalone `disused=yes` is also honored.
function isOutOfService(tags: Record<string, string>): boolean {
  return (
    tags["disused:amenity"] != null || tags["abandoned:amenity"] != null || tags.disused === "yes"
  );
}

const svcOf = (tags: Record<string, string>): Svc => (isOutOfService(tags) ? "out" : "in");
const waterOf = (tags: Record<string, string>): Water => (isDogWater(tags) ? "dog" : "human");

function recencyOf(tags: Record<string, string>, cutoffMs: number): Recency {
  const checked = lastCheckedMs(tags);
  if (checked == null) return "never";
  return checked >= cutoffMs ? "fresh" : "stale";
}

function fountainName(f: Fountain): string {
  return f.tags.name ?? `Fountain #${f.id}`;
}

// Read-only popup: name, last-checked date, status flags, OSM link. No edit
// controls — this view is purely for finding water nearby.
function FountainPopup({ f, distM }: { f: Fountain; distM: number | null }) {
  return (
    <div className="flex w-52 flex-col gap-1 text-neutral-800">
      <div className="leading-tight font-semibold">{fountainName(f)}</div>
      {distM != null && <div className="text-xs text-neutral-500">{fmtDist(distM)} away</div>}
      {f.tags.check_date ? (
        <div className="text-xs text-neutral-500">Last checked in OSM: {f.tags.check_date}</div>
      ) : (
        <div className="text-xs text-neutral-500">Never verified on the ground</div>
      )}
      {isDogWater(f.tags) && (
        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-violet-700">
          <DogIcon size={14} /> Dog water — not for humans
        </div>
      )}
      {isOutOfService(f.tags) && (
        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
          <WrenchIcon size={14} /> Marked out of service
        </div>
      )}
      <a
        href={`https://www.openstreetmap.org/node/${f.id}`}
        target="_blank"
        rel="noreferrer"
        className="mt-1 text-xs font-medium text-blue-600 underline underline-offset-2"
      >
        View on OpenStreetMap
      </a>
    </div>
  );
}

// One filter pill: label + low-emphasis match count, active/inactive states.
function Pill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        active ? "bg-sky-deep text-ink" : "bg-paper/40 text-ink-dim hover:text-ink"
      }`}
    >
      {children}
      <span className={`font-normal ${active ? "text-ink/55" : "text-ink-dim/55"}`}>{count}</span>
    </button>
  );
}

function PillRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-ink-dim mr-0.5 text-[11px] font-semibold tracking-wide uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

// Toggle a value in a Set-typed filter without mutating the original.
function toggled<T>(set: Set<T>, v: T): Set<T> {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
}

function FilterPills({
  svc,
  setSvc,
  water,
  setWater,
  rec,
  setRec,
  counts,
}: {
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  rec: Set<Recency>;
  setRec: (s: Set<Recency>) => void;
  counts: Counts;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <PillRow label="Service">
        <Pill active={svc.has("in")} count={counts.inN} onClick={() => setSvc(toggled(svc, "in"))}>
          In service
        </Pill>
        <Pill
          active={svc.has("out")}
          count={counts.outN}
          onClick={() => setSvc(toggled(svc, "out"))}
        >
          Out of service
        </Pill>
      </PillRow>
      <PillRow label="Water">
        <Pill
          active={water.has("human")}
          count={counts.humanN}
          onClick={() => setWater(toggled(water, "human"))}
        >
          Human
        </Pill>
        <Pill
          active={water.has("dog")}
          count={counts.dogN}
          onClick={() => setWater(toggled(water, "dog"))}
        >
          Dog
        </Pill>
      </PillRow>
      <PillRow label="Verified">
        <Pill
          active={rec.has("fresh")}
          count={counts.freshN}
          onClick={() => setRec(toggled(rec, "fresh"))}
        >
          Past year
        </Pill>
        <Pill
          active={rec.has("stale")}
          count={counts.staleN}
          onClick={() => setRec(toggled(rec, "stale"))}
        >
          Older
        </Pill>
        <Pill
          active={rec.has("never")}
          count={counts.neverN}
          onClick={() => setRec(toggled(rec, "never"))}
        >
          Never
        </Pill>
      </PillRow>
    </div>
  );
}

// Panel header: title, locate button, radius + search controls, filters, and
// status. Shared by the mobile bottom sheet and the desktop side panel.
function PanelHead({
  busy,
  err,
  searched,
  anchor,
  visibleN,
  counts,
  svc,
  setSvc,
  water,
  setWater,
  rec,
  setRec,
  radiusMi,
  onRadiusChange,
  onLocate,
  onSearch,
}: {
  busy: boolean;
  err: string | null;
  searched: boolean;
  anchor: Anchor | null;
  visibleN: number;
  counts: Counts;
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  rec: Set<Recency>;
  setRec: (s: Set<Recency>) => void;
  radiusMi: number;
  onRadiusChange: (mi: number) => void;
  onLocate: () => void;
  onSearch: () => void;
}) {
  // Local draft so the user can freely type (incl. an empty field) before we
  // commit a clamped number on submit/blur. `radiusMi` only changes through
  // `commit`, so the draft is resynced right here — no effect needed.
  const [draft, setDraft] = useState(String(radiusMi));

  const commit = () => {
    const n = Number(draft);
    const next = Number.isFinite(n) && n > 0 ? clampRadius(n) : radiusMi;
    setDraft(String(next));
    onRadiusChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-display flex items-center gap-2 text-xl leading-tight font-bold">
            <DropIcon size={22} weight="duotone" className="text-sky-deep" />
            Fountains near you
          </h1>
          <p className="text-ink-dim text-sm">
            {searched
              ? `Public drinking water within ${radiusLabel(radiusMi)} of your ${
                  anchor === "pin" ? "pin" : "location"
                }, from OpenStreetMap.`
              : "Tap the map to drop a pin, or use the locate button, then search."}
          </p>
        </div>
        <button
          onClick={onLocate}
          disabled={busy}
          title="Use my location"
          className="border-paper-line bg-paper/40 text-ink hover:border-sky-deep/60 hover:text-sky-deep shrink-0 rounded-lg border px-3 py-2 transition disabled:opacity-40"
        >
          <CrosshairIcon size={18} />
        </button>
      </div>

      {/* Radius + explicit search. Enter in the field commits and searches. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
          onSearch();
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <label
            htmlFor="radius-mi"
            className="text-ink-dim text-[11px] font-semibold tracking-wide uppercase"
          >
            Radius
          </label>
          <input
            id="radius-mi"
            type="number"
            inputMode="decimal"
            min={MIN_RADIUS_MI}
            max={MAX_RADIUS_MI}
            step={0.1}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
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

      <FilterPills
        svc={svc}
        setSvc={setSvc}
        water={water}
        setWater={setWater}
        rec={rec}
        setRec={setRec}
        counts={counts}
      />

      {err && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-700">
          <span>{err}</span>
          <button
            onClick={onSearch}
            disabled={busy}
            className="self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}

      {searched && !busy && !err && (
        <span className="bg-sky/15 text-sky-deep w-fit rounded-full px-2 py-0.5 text-xs font-semibold">
          {visibleN} shown
        </span>
      )}
    </div>
  );
}

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];
// Neutral dark pin for the dropped search anchor — distinct from fountain colors.
const PIN_COLOR = "#334155";

export default function PublicFountainsPage() {
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

  // Fountains sorted nearest-first (from the searched anchor), each tagged with
  // distance + filter classes.
  const ranked = useMemo<Ranked[]>(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - FRESH_MONTHS);
    const cutoffMs = cutoff.getTime();
    return fountains
      .map((f) => ({
        f,
        distM: searchedAt ? haversine(searchedAt, f) : null,
        svc: svcOf(f.tags),
        water: waterOf(f.tags),
        rec: recencyOf(f.tags, cutoffMs),
      }))
      .sort((a, b) => (a.distM ?? Infinity) - (b.distM ?? Infinity));
  }, [fountains, searchedAt]);

  // Per-category totals for the pill counts (independent of the other dimensions).
  const counts = useMemo<Counts>(() => {
    const c: Counts = { inN: 0, outN: 0, humanN: 0, dogN: 0, freshN: 0, staleN: 0, neverN: 0 };
    for (const r of ranked) {
      if (r.svc === "in") c.inN++;
      else c.outN++;
      if (r.water === "human") c.humanN++;
      else c.dogN++;
      if (r.rec === "fresh") c.freshN++;
      else if (r.rec === "stale") c.staleN++;
      else c.neverN++;
    }
    return c;
  }, [ranked]);

  const visible = useMemo(
    () => ranked.filter((r) => svc.has(r.svc) && water.has(r.water) && rec.has(r.rec)),
    [ranked, svc, water, rec],
  );

  const markers: MapMarker[] = useMemo(() => {
    const ms: MapMarker[] = visible.map(({ f, distM, svc: s, water: w }) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: s === "out" ? "#9ca3af" : w === "dog" ? "#7c3aed" : "#0284c7",
      dimmed: s === "out",
      popup: <FountainPopup f={f} distM={distM} />,
    }));
    // The dropped pin itself; a GPS anchor is already marked by the blue dot.
    if (center && anchor === "pin") {
      ms.push({ id: "search-pin", lat: center.lat, lon: center.lon, color: PIN_COLOR });
    }
    return ms;
  }, [visible, center, anchor]);

  const viewCenter: [number, number] = center
    ? [center.lat, center.lon]
    : pos
      ? [pos.lat, pos.lon]
      : DEFAULT_CENTER;

  const head = (
    <PanelHead
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
        <section className="border-paper-line bg-paper/95 pointer-events-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border p-6 shadow-xl backdrop-blur md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          {head}
          {body}
        </section>
      </div>
    </main>
  );
}
