import type { StopStatus } from "@/store/run";

// Single source of truth for the point-status palette. These are TS constants
// (not Tailwind classes) because they're injected into Leaflet divIcon HTML
// strings, which Tailwind can't see.

// Marker colors/labels for points updated in OSM this session — shared by the
// planner and the public fountain browser so an edit reads the same everywhere.
export const EDIT_COLOR: Partial<Record<StopStatus, string>> = {
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
};

export const EDIT_LABEL: Partial<Record<StopStatus, string>> = {
  confirm: "✓",
  dog_only: "🐕",
  out_of_order: "!",
  removed: "✕",
};

// Full palette for run stops, including the not-yet-surveyed states.
export const STATUS_COLOR: Record<StopStatus, string> = {
  pending: "#9ca3af",
  confirm: "#16a34a",
  dog_only: "#7c3aed",
  out_of_order: "#d97706",
  removed: "#dc2626",
  skipped: "#6b7280",
};
