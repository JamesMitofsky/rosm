import type { EditAction, EditExtras } from "./schemas";

// Local YYYY-MM-DD. Safe in the browser (no node deps), mirrors lib/osm todayIso
// so the optimistic client summary matches what the server will write.
export function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

// Human-readable summary of an edit. Shared by the server edit route (real write)
// and the client outbox (optimistic, shown before the write reaches OSM).
export function editSummary(
  action: EditAction,
  tagKey: string,
  today: string,
  extras?: EditExtras,
): string {
  let base: string;
  switch (action) {
    case "confirm":
      base = `confirmed · check_date=${today}`;
      break;
    case "out_of_order":
      base = `${tagKey} → disused:${tagKey} · check_date=${today}`;
      break;
    case "removed":
      base = `${tagKey} → abandoned:${tagKey} · check_date=${today}`;
      break;
  }
  // Mirror applyAction's gating so the optimistic summary matches the OSM write.
  if (extras?.seasonal && action === "confirm") {
    base += " · seasonal=yes";
  }
  if (extras?.audience && action === "confirm") {
    const humanOk = extras.audience !== "dogs";
    base += ` · drinking_water=${humanOk ? "yes" : "no"} · dog=${
      extras.audience === "humans" ? "no" : "yes"
    }`;
  }
  if (extras?.note) base += " · note added";
  return base;
}
