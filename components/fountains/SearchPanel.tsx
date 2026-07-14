"use client";

import FilterPills from "@/components/fountains/FilterPills";
import SearchProgress from "@/components/fountains/SearchProgress";
import ErrorNotice from "@/components/ui/ErrorNotice";
import type { Counts, Water } from "@/lib/fountainFilters";

// Radius for GPS-anchored searches. Widening happens by panning the map and
// hitting "Search this area", so this is no longer editable.
export const DEFAULT_RADIUS_MI = 1;

// Panel header: search control, filters, and status. Shared by the mobile
// bottom sheet and the desktop side panel.
export default function SearchPanel({
  busy,
  err,
  counts,
  water,
  setWater,
  onSearch,
}: {
  busy: boolean;
  err: string | null;
  counts: Counts;
  water: Set<Water>;
  setWater: (s: Set<Water>) => void;
  onSearch: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <FilterPills water={water} setWater={setWater} counts={counts} />

        {/* Filtering is client-side display only — results are already loaded, so
            there's no search button. A running search still narrates itself. */}
        {busy && <SearchProgress active variant="inline" />}
      </div>

      {err && <ErrorNotice message={err} tone="light" onRetry={onSearch} retrying={busy} />}
    </div>
  );
}
