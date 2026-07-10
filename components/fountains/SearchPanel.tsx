"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import FilterPills from "@/components/fountains/FilterPills";
import SearchProgress from "@/components/fountains/SearchProgress";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Counts, Svc, Water } from "@/lib/fountainFilters";

// Radius for anchor-based searches (GPS fix / dropped pin). Widening happens by
// panning the map and hitting "Search this area", so this is no longer editable.
export const DEFAULT_RADIUS_MI = 1;

// Where the search anchor came from: GPS fix or a pin dropped on the map.
export type Anchor = "gps" | "pin";

// Panel header: search control, filters, and status. Shared by the mobile
// bottom sheet and the desktop side panel.
export default function SearchPanel({
  busy,
  err,
  anchor,
  counts,
  svc,
  setSvc,
  water,
  setWater,
  showFilters,
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
  // Hidden until the first search lands — nothing to filter before results.
  showFilters: boolean;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Filters + explicit search. Enter submits and searches. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="flex flex-col gap-2"
      >
        {showFilters && (
          <FilterPills
            svc={svc}
            setSvc={setSvc}
            water={water}
            setWater={setWater}
            counts={counts}
          />
        )}

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
