"use client";

import { useState } from "react";
import { WrenchIcon } from "@phosphor-icons/react";
import { DogIcon } from "@/components/icons/DogIcon";
import type { Fountain } from "@rosm/core/schemas";
import { isDogWater, isOutOfService } from "@rosm/core/fountainFilters";
import { checkedAgoLabel } from "@rosm/core/checkDate";
import { fmtDist } from "@rosm/core/geo";

// Read-only popup: name, last-checked date, status flags. No edit
// controls — this view is purely for finding water nearby.
export default function FountainPopup({ f, distM }: { f: Fountain; distM: number | null }) {
  // Snapshot the clock once when the popup mounts — reading Date.now() during
  // render is impure; the "checked ago" label doesn't need to tick live.
  const [now] = useState(() => Date.now());
  return (
    <div className="flex w-52 flex-col gap-1 text-neutral-800">
      <div className="leading-tight font-semibold">{checkedAgoLabel(f.tags, now)}</div>
      {distM != null && <div className="text-xs text-neutral-500">{fmtDist(distM)} away</div>}
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
    </div>
  );
}
