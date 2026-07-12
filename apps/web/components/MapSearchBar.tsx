"use client";

import { useEffect, useRef, useState } from "react";
import { CircleNotchIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

type Props = {
  // Called with the geocoded coordinates of the chosen result.
  onResult: (at: { lat: number; lon: number }) => void;
  placeholder?: string;
  className?: string;
};

type Hit = { place_id: number; display_name: string; lat: string; lon: string };

// Floating place/address search with a live autocomplete dropdown. Debounces
// Nominatim (OSM) lookups as the user types and hands the chosen match back to
// the parent, which recenters the map. Shared so any map surface can drop in a
// "jump to a place" box.
export default function MapSearchBar({
  onResult,
  placeholder = "Search a place or address",
  className,
}: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced geocode: fires 300ms after the last keystroke. A per-run `stale`
  // flag drops out-of-order responses so a slow earlier query can't clobber a
  // newer one. Queries under 3 chars are skipped — too noisy to geocode.
  useEffect(() => {
    const query = q.trim();
    const stale = { current: false };
    const t = setTimeout(async () => {
      if (query.length < 3) {
        setHits([]);
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
        );
        const j = (await r.json()) as Hit[];
        if (!stale.current) setHits(j);
      } catch {
        if (!stale.current) setHits([]);
      } finally {
        if (!stale.current) setBusy(false);
      }
    }, 300);
    return () => {
      stale.current = true;
      clearTimeout(t);
    };
  }, [q]);

  // Collapse the dropdown when focus leaves the whole widget. Also collapse the
  // input back to a button if the user hasn't typed anything.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
        setExpanded((prev) => (q.trim() ? prev : false));
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [q]);

  // Reveal the input, then focus it once the expand transition kicks in.
  const expand = () => {
    setExpanded(true);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pick = (h: Hit) => {
    onResult({ lat: Number(h.lat), lon: Number(h.lon) });
    setQ(h.display_name.split(",")[0]);
    setHits([]);
    setOpen(false);
  };

  const showList = open && q.trim().length >= 3 && (busy || hits.length > 0);

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <div
        role={expanded ? undefined : "button"}
        aria-label={expanded ? undefined : placeholder}
        onClick={expanded ? undefined : expand}
        className={`border-paper-line bg-paper/90 flex items-center rounded-sm border py-1.5 shadow-sm backdrop-blur transition-[padding,column-gap] ${
          expanded ? "gap-1.5 px-2.5" : "cursor-pointer gap-0 px-2"
        }`}
      >
        {busy ? (
          <CircleNotchIcon size={14} className="text-ink-dim shrink-0 animate-spin" />
        ) : (
          <MagnifyingGlassIcon size={14} className="text-ink-dim shrink-0" />
        )}
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) pick(hits[0]);
            if (e.key === "Escape") {
              setOpen(false);
              if (!q.trim()) setExpanded(false);
              inputRef.current?.blur();
            }
          }}
          placeholder={placeholder}
          tabIndex={expanded ? 0 : -1}
          className={`text-ink placeholder:text-ink-dim bg-transparent text-xs font-semibold transition-[width,opacity] duration-200 outline-none ${
            expanded ? "w-40 opacity-100 md:w-52" : "w-0 opacity-0"
          }`}
        />
      </div>

      {showList && (
        <ul className="border-paper-line bg-paper/95 absolute top-full right-0 left-0 z-10 mt-1 overflow-hidden rounded-sm border shadow-md backdrop-blur">
          {hits.length === 0 && busy ? (
            <li className="text-ink-dim px-2.5 py-2 text-[11px]">Searching…</li>
          ) : (
            hits.map((h) => (
              <li key={h.place_id}>
                <button
                  type="button"
                  onClick={() => pick(h)}
                  className="text-ink hover:bg-sky-deep/10 block w-full truncate px-2.5 py-1.5 text-left text-xs transition"
                  title={h.display_name}
                >
                  {h.display_name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
