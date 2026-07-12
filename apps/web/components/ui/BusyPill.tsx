import { CircleNotchIcon } from "@phosphor-icons/react";

// Compact spinner chip floated over a map while a request is in flight.
// For fetches where the map should stay visible (points already loaded),
// unlike SearchProgress's full overlay for a first load into an empty map.
export default function BusyPill({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white shadow-md backdrop-blur-md">
      <CircleNotchIcon size={16} className="animate-spin" />
      {label}
    </div>
  );
}
