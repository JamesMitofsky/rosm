"use client";

import { useState } from "react";
import { CrosshairIcon, DropIcon, MagnifyingGlassIcon, SpinnerIcon } from "@phosphor-icons/react";
import FilterPills from "@/components/fountains/FilterPills";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Counts, Recency, Svc, Water } from "@/lib/fountainFilters";

// Default radius to look for fountains around the search point; user can override.
export const DEFAULT_RADIUS_MI = 1;
// Keep user-entered radius sane before it hits the API / display.
const MIN_RADIUS_MI = 0.1;
const MAX_RADIUS_MI = 25;
const clampRadius = (mi: number) => Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, mi));
const radiusLabel = (mi: number) => `${mi} ${mi === 1 ? "mile" : "miles"}`;

// Where the search anchor came from: GPS fix or a pin dropped on the map.
export type Anchor = "gps" | "pin";

// Panel header: title, locate button, radius + search controls, filters, and
// status. Shared by the mobile bottom sheet and the desktop side panel.
export default function SearchPanel({
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

      {err && <ErrorNotice message={err} tone="light" onRetry={onSearch} retrying={busy} />}

      {searched && !busy && !err && (
        <span className="bg-sky/15 text-sky-deep w-fit rounded-full px-2 py-0.5 text-xs font-semibold">
          {visibleN} shown
        </span>
      )}
    </div>
  );
}
