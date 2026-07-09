"use client";

import { DogIcon, WrenchIcon } from "@phosphor-icons/react";
import type { Fountain } from "@/lib/schemas";
import { fountainName, isDogWater, isOutOfService } from "@/lib/fountainFilters";
import { fmtDist } from "@/lib/geo";

// Read-only popup: name, last-checked date, status flags, OSM link. No edit
// controls — this view is purely for finding water nearby.
export default function FountainPopup({ f, distM }: { f: Fountain; distM: number | null }) {
  return (
    <div className="flex w-52 flex-col gap-1 text-neutral-800">
      {f.tags.name && <div className="leading-tight font-semibold">{fountainName(f)}</div>}
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
