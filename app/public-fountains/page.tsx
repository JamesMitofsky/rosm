"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useAnimationControls, useDragControls } from "framer-motion";
import {
  ArrowLeftIcon,
  CrosshairIcon,
  DropIcon,
  DogIcon,
  MapPinIcon,
  SpinnerIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { Fountain } from "@/lib/schemas";
import type { MapMarker } from "@/components/MapView";
import { apiFetch } from "@/lib/api";
import { getCurrentPosition } from "@/lib/geolocation";
import { fmtDist, haversine, milesToMeters, type Pt } from "@/lib/geo";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

// How wide to look for fountains around the user.
const RADIUS_MI = 1;
// We only care about human drinking water for the public view.
const TAG = { key: "amenity", value: "drinking_water" } as const;

type Svc = "in" | "out";
type Water = "human" | "dog";
// A fountain with its distance and its filter classifications, precomputed once.
type Ranked = { f: Fountain; distM: number | null; svc: Svc; water: Water };
type Counts = { inN: number; outN: number; humanN: number; dogN: number };

// True when OSM tags flag this point as not human-potable (dog water).
function isDogWater(tags: Record<string, string>): boolean {
  return tags.drinking_water === "no";
}

// True when OSM lifecycle tags flag this point as no longer in service. This app
// marks a fountain out-of-service by moving `amenity` to `disused:`/`abandoned:`;
// a standalone `disused=yes` is also honored.
function isOutOfService(tags: Record<string, string>): boolean {
  return (
    tags["disused:amenity"] != null ||
    tags["abandoned:amenity"] != null ||
    tags.disused === "yes"
  );
}

const svcOf = (tags: Record<string, string>): Svc => (isOutOfService(tags) ? "out" : "in");
const waterOf = (tags: Record<string, string>): Water => (isDogWater(tags) ? "dog" : "human");

function fountainName(f: Fountain): string {
  return f.tags.name ?? `Fountain #${f.id}`;
}

// Read-only popup: name, last-checked date, status flags, OSM link. No edit
// controls — this view is purely for finding water nearby.
function FountainPopup({ f, distM }: { f: Fountain; distM: number | null }) {
  return (
    <div className="flex w-52 flex-col gap-1 text-neutral-800">
      <div className="font-semibold leading-tight">{fountainName(f)}</div>
      {distM != null && (
        <div className="text-xs text-neutral-500">{fmtDist(distM)} away</div>
      )}
      {f.tags.check_date && (
        <div className="text-xs text-neutral-500">
          Last checked in OSM: {f.tags.check_date}
        </div>
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
      <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterPills({
  svc,
  setSvc,
  water,
  setWater,
  counts,
}: {
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  counts: Counts;
}) {
  const toggleSvc = (v: Svc) => {
    const n = new Set(svc);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setSvc(n);
  };
  const toggleWater = (v: Water) => {
    const n = new Set(water);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setWater(n);
  };
  return (
    <div className="flex flex-col gap-2.5">
      <PillRow label="Service">
        <Pill active={svc.has("in")} count={counts.inN} onClick={() => toggleSvc("in")}>
          In service
        </Pill>
        <Pill active={svc.has("out")} count={counts.outN} onClick={() => toggleSvc("out")}>
          Out of service
        </Pill>
      </PillRow>
      <PillRow label="Water">
        <Pill active={water.has("human")} count={counts.humanN} onClick={() => toggleWater("human")}>
          Human
        </Pill>
        <Pill active={water.has("dog")} count={counts.dogN} onClick={() => toggleWater("dog")}>
          Dog
        </Pill>
      </PillRow>
    </div>
  );
}

// Panel header: title, locate button, filters, and load/count status. Shared by
// the mobile bottom sheet and the desktop side panel.
function PanelHead({
  busy,
  err,
  visibleN,
  counts,
  svc,
  setSvc,
  water,
  setWater,
  onLocate,
}: {
  busy: boolean;
  err: string | null;
  visibleN: number;
  counts: Counts;
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  onLocate: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold leading-tight">
            <DropIcon size={22} weight="duotone" className="text-sky-deep" />
            Fountains near you
          </h1>
          <p className="text-sm text-ink-dim">
            Public drinking water within {RADIUS_MI} mile, from OpenStreetMap.
          </p>
        </div>
        <button
          onClick={onLocate}
          disabled={busy}
          title="Use my location"
          className="shrink-0 rounded-lg border border-paper-line bg-paper/40 px-3 py-2 text-ink transition hover:border-sky-deep/60 hover:text-sky-deep disabled:opacity-40"
        >
          <CrosshairIcon size={18} />
        </button>
      </div>

      <FilterPills svc={svc} setSvc={setSvc} water={water} setWater={setWater} counts={counts} />

      {busy && (
        <div className="flex justify-center py-2 text-ink-dim">
          <SpinnerIcon size={24} className="animate-spin" />
        </div>
      )}

      {err && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-700">
          <span>{err}</span>
          <button
            onClick={onLocate}
            disabled={busy}
            className="self-start rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
          >
            Try again
          </button>
        </div>
      )}

      {!busy && !err && (
        <span className="w-fit rounded-full bg-sky/15 px-2 py-0.5 text-xs font-semibold text-sky-deep">
          {visibleN} shown
        </span>
      )}
    </div>
  );
}

// Scrollable list of the currently-visible fountains.
function PanelList({ visible, total }: { visible: Ranked[]; total: number }) {
  if (visible.length === 0) {
    return (
      <p className="text-sm text-ink-dim">
        {total === 0
          ? `No public fountains mapped within ${RADIUS_MI} mile.`
          : "No fountains match the current filters."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {visible.map(({ f, distM, svc, water }) => {
        const out = svc === "out";
        const dog = water === "dog";
        return (
          <li
            key={f.id}
            className={`flex items-center justify-between gap-2 rounded-lg bg-paper-deep px-3 py-2 text-sm ${
              out ? "opacity-60" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <MapPinIcon
                size={15}
                weight="fill"
                className={out ? "text-neutral-400" : dog ? "text-violet-600" : "text-sky-deep"}
              />
              <span className="truncate">{fountainName(f)}</span>
              {dog && <DogIcon size={14} className="shrink-0 text-violet-600" />}
              {out && <WrenchIcon size={13} className="shrink-0 text-neutral-500" />}
            </span>
            {distM != null && (
              <span className="shrink-0 text-xs text-ink-dim">{fmtDist(distM)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Mobile-only draggable bottom sheet with two snap points (peek / full). The
// `head` region stays visible when peeked; `body` scrolls when expanded. Only the
// grab handle initiates a drag, so tapping controls / scrolling the list is free.
function BottomSheet({ head, body }: { head: ReactNode; body: ReactNode }) {
  const controls = useAnimationControls();
  const drag = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const [collapseOffset, setCollapseOffset] = useState(0);
  const [snap, setSnap] = useState<"peek" | "full">("peek");

  // Peek shows only the handle + head; collapse distance is the rest of the sheet.
  useEffect(() => {
    const measure = () => {
      const sh = sheetRef.current?.offsetHeight ?? 0;
      const ph = peekRef.current?.offsetHeight ?? 0;
      setCollapseOffset(Math.max(0, sh - ph));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (peekRef.current) ro.observe(peekRef.current);
    return () => ro.disconnect();
  }, []);

  // Keep the resting position correct once measured / when content resizes.
  useEffect(() => {
    if (collapseOffset > 0) controls.set({ y: snap === "full" ? 0 : collapseOffset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseOffset]);

  const snapTo = (s: "peek" | "full") => {
    setSnap(s);
    controls.start({
      y: s === "full" ? 0 : collapseOffset,
      transition: { type: "spring", stiffness: 420, damping: 40 },
    });
  };

  return (
    <motion.div
      ref={sheetRef}
      drag="y"
      dragControls={drag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: collapseOffset }}
      dragElastic={0.06}
      initial={{ y: "55%" }}
      animate={controls}
      onDrag={() => {
        moved.current = true;
      }}
      onDragEnd={(_, info) => {
        if (info.velocity.y > 300) return snapTo("peek");
        if (info.velocity.y < -300) return snapTo("full");
        if (snap === "full") return snapTo(info.offset.y > 60 ? "peek" : "full");
        return snapTo(info.offset.y < -60 ? "full" : "peek");
      }}
      className="safe-pb fixed inset-x-0 bottom-0 z-[1000] flex h-[88dvh] flex-col rounded-t-2xl border-t border-paper-line bg-paper/95 shadow-xl backdrop-blur md:hidden"
    >
      <div ref={peekRef} className="shrink-0">
        <div
          role="button"
          tabIndex={0}
          aria-label="Expand or collapse panel"
          onPointerDown={(e) => {
            moved.current = false;
            drag.start(e);
          }}
          onClick={() => {
            if (!moved.current) snapTo(snap === "full" ? "peek" : "full");
          }}
          className="flex cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
        >
          <div className="h-1.5 w-10 rounded-full bg-paper-line" />
        </div>
        <div className="px-5">{head}</div>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 pt-3">{body}</div>
    </motion.div>
  );
}

const DEFAULT_CENTER: [number, number] = [38.9072, -77.0369];

export default function PublicFountainsPage() {
  const [pos, setPos] = useState<Pt | null>(null);
  const [recenterKey, setRecenterKey] = useState("init");
  const [fountains, setFountains] = useState<Fountain[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Filters: default to in-service only; both water types on.
  const [svc, setSvc] = useState<Set<Svc>>(() => new Set<Svc>(["in"]));
  const [water, setWater] = useState<Set<Water>>(() => new Set<Water>(["human", "dog"]));

  // Locate, then fetch the drinking-water points around that location. We ask for
  // out-of-service variants too so the Service filter has something to reveal.
  const locateAndLoad = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const p = await getCurrentPosition().catch(() => {
        throw new Error("Couldn't get your location. Allow location access and retry.");
      });
      const here = { lat: p.lat, lon: p.lon };
      setPos(here);
      setRecenterKey(`${here.lat},${here.lon}`);

      const r = await apiFetch("/api/fountains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...here,
          radiusM: milesToMeters(RADIUS_MI),
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
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Deferred off the effect body so the initial state updates don't
    // cascade-render synchronously (matches the planner's mount pattern).
    Promise.resolve().then(locateAndLoad);
  }, [locateAndLoad]);

  // Fountains sorted nearest-first, each tagged with distance + filter classes.
  const ranked = useMemo<Ranked[]>(() => {
    return fountains
      .map((f) => ({
        f,
        distM: pos ? haversine(pos, f) : null,
        svc: svcOf(f.tags),
        water: waterOf(f.tags),
      }))
      .sort((a, b) => (a.distM ?? Infinity) - (b.distM ?? Infinity));
  }, [fountains, pos]);

  // Per-category totals for the pill counts (independent of the other dimension).
  const counts = useMemo<Counts>(() => {
    let inN = 0;
    let outN = 0;
    let humanN = 0;
    let dogN = 0;
    for (const r of ranked) {
      if (r.svc === "in") inN++;
      else outN++;
      if (r.water === "human") humanN++;
      else dogN++;
    }
    return { inN, outN, humanN, dogN };
  }, [ranked]);

  const visible = useMemo(
    () => ranked.filter((r) => svc.has(r.svc) && water.has(r.water)),
    [ranked, svc, water],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      visible.map(({ f, distM, svc: s, water: w }) => ({
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: s === "out" ? "#9ca3af" : w === "dog" ? "#7c3aed" : "#0284c7",
        dimmed: s === "out",
        popup: <FountainPopup f={f} distM={distM} />,
      })),
    [visible],
  );

  const viewCenter: [number, number] = pos ? [pos.lat, pos.lon] : DEFAULT_CENTER;
  const total = counts.inN + counts.outN;

  const head = (
    <PanelHead
      busy={busy}
      err={err}
      visibleN={visible.length}
      counts={counts}
      svc={svc}
      setSvc={setSvc}
      water={water}
      setWater={setWater}
      onLocate={locateAndLoad}
    />
  );
  const body = !busy && !err ? <PanelList visible={visible} total={total} /> : null;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-paper font-body text-ink">
      {/* Map: full-bleed under the floating UI at every size. */}
      <div className="absolute inset-0">
        <MapView
          center={viewCenter}
          zoom={15}
          recenterKey={recenterKey}
          markers={markers}
          userPos={pos ? [pos.lat, pos.lon] : undefined}
          className="absolute inset-0 h-full w-full"
        />
      </div>

      {/* Back link, floating over the map. */}
      <header className="safe-top pointer-events-none absolute inset-x-0 z-[1000] flex items-center p-4 md:p-5">
        <Link
          href="/"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-paper-line bg-paper/90 px-3 py-1.5 text-xs font-semibold text-ink-dim shadow-sm backdrop-blur transition hover:text-ink"
        >
          <ArrowLeftIcon size={14} />
          Home
        </Link>
      </header>

      {/* Mobile: draggable bottom sheet. */}
      <BottomSheet head={head} body={body} />

      {/* Desktop: right-anchored floating panel. */}
      <div className="pointer-events-none hidden md:absolute md:inset-y-0 md:right-0 md:left-auto md:z-[1000] md:flex md:items-center md:p-6">
        <section className="pointer-events-auto flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-paper-line bg-paper/95 p-6 shadow-xl backdrop-blur md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
          {head}
          {body}
        </section>
      </div>
    </main>
  );
}
