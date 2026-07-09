"use client";

import { useState } from "react";
import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import FilterPills from "@/components/fountains/FilterPills";
import SearchProgress from "@/components/fountains/SearchProgress";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Counts, Recency, Svc, Water } from "@/lib/fountainFilters";

// Default radius to look for fountains around the search point; user can override.
export const DEFAULT_RADIUS_MI = 1;
// Keep user-entered radius sane before it hits the API / display.
const MIN_RADIUS_MI = 0.1;
const MAX_RADIUS_MI = 25;
const clampRadius = (mi: number) => Math.min(MAX_RADIUS_MI, Math.max(MIN_RADIUS_MI, mi));

// Where the search anchor came from: GPS fix or a pin dropped on the map.
export type Anchor = "gps" | "pin";

// Panel header: title, locate button, radius + search controls, filters, and
// status. Shared by the mobile bottom sheet and the desktop side panel.
export default function SearchPanel({
  busy,
  err,
  anchor,
  counts,
  svc,
  setSvc,
  water,
  setWater,
  rec,
  setRec,
  radiusMi,
  onRadiusChange,
  onSearch,
}: {
  busy: boolean;
  err: string | null;
  anchor: Anchor | null;
  counts: Counts;
  svc: Set<Svc>;
  setSvc: (s: Set<Svc>) => void;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  rec: Set<Recency>;
  setRec: (s: Set<Recency>) => void;
  radiusMi: number;
  onRadiusChange: (mi: number) => void;
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

        <details className="group border-paper-line rounded-lg border">
          <summary className="text-ink hover:text-sky-deep flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-semibold">
            Filters
            <CaretDownIcon size={16} className="text-ink-dim transition group-open:rotate-180" />
          </summary>
          <div className="border-paper-line border-t px-3 py-3">
            <FilterPills
              svc={svc}
              setSvc={setSvc}
              water={water}
              setWater={setWater}
              rec={rec}
              setRec={setRec}
              counts={counts}
            />
          </div>
        </details>

        {/* While a search runs, the button gives way to the self-narrating
            loader (same one the landing hero uses) so the wait reads clearly. */}
        {busy ? (
          <SearchProgress active variant="inline" />
        ) : (
          <button
            type="submit"
            className="bg-sky-deep text-ink hover:bg-sky-deep/85 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:opacity-40"
          >
            <MagnifyingGlassIcon size={16} />
            {anchor === "pin" ? "Search around pin" : "Search"}
          </button>
        )}
      </form>

      {err && <ErrorNotice message={err} tone="light" onRetry={onSearch} retrying={busy} />}
    </div>
  );
}
