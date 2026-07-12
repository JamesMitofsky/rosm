"use client";

import { MapPinPlusIcon } from "@phosphor-icons/react";

// Map popup shown above a tapped empty spot, offering to drop a pass-through
// waypoint there. The tap only pins the popup — the via is added on confirm.
export default function WaypointPopup({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="flex items-center gap-1.5 rounded bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
    >
      <MapPinPlusIcon size={16} /> Add a waypoint
    </button>
  );
}
