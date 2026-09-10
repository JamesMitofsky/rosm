<script lang="ts">
  import MapView, { type MapMarker } from "@/components/MapView.svelte";
  import PointPopup, { type PointEdit } from "@/components/PointPopup.svelte";
  import type { EditAction, EditExtras, Fountain } from "@rosm/core/schemas";
  import type { StopStatus } from "@rosm/core/stores/run";
  import { editSummary, todayLocal } from "@rosm/core/editSummary";
  import { celebratePoint } from "@/lib/confetti";
  import { openingViewForViewport } from "@/lib/basemap/frames";
  import { DC_FOUNTAINS, DC_ROUTE, STATUS_COLOR, SEED_STATUSES } from "@/lib/demoRoute";

  // Interactive replica of the run screen for the landing hero. Every tap flows
  // through the real PointPopup, but edits only touch local state — nothing is
  // sent to OSM, queued in the outbox, or persisted anywhere.
  let { class: className = "" }: { class?: string } = $props();

  // The opening view is initial-only, so pick it once at mount. Read from the
  // frame spec rather than restated here: this map dissolves out of a picture
  // rendered at exactly that centre and zoom, and two copies of either number
  // are two things to keep in step. The centre is not the route's own — the
  // spec shifts it so the route sits clear of the hero copy painted over the
  // map (see `frames.ts`).
  const { center, zoom } = openingViewForViewport("demo-run");

  function seedEdits(): Record<number, PointEdit> {
    const today = todayLocal();
    return Object.fromEntries(
      Object.entries(SEED_STATUSES).map(([id, status]) => [
        Number(id),
        {
          status,
          summary: editSummary(status as EditAction, "amenity", today),
          syncState: "sent" as const,
        },
      ]),
    );
  }

  let statuses = $state<Record<number, StopStatus>>({ ...SEED_STATUSES });
  let edits = $state<Record<number, PointEdit>>(seedEdits());

  function record(f: Fountain, action: EditAction, extras?: EditExtras) {
    statuses = { ...statuses, [f.id]: action as StopStatus };
    edits = {
      ...edits,
      [f.id]: {
        status: action as StopStatus,
        summary: editSummary(action, "amenity", todayLocal(), extras),
        syncState: "pending",
        extras,
      },
    };
    celebratePoint();
    // Fake the offline-first outbox: "saved · sending…" flips to "sent to OSM"
    // a beat later, without any network involved.
    setTimeout(() => {
      if (edits[f.id]) edits = { ...edits, [f.id]: { ...edits[f.id], syncState: "sent" } };
    }, 900);
  }

  const markers = $derived<MapMarker[]>(
    DC_FOUNTAINS.map((f, i) => ({
      id: f.id,
      lat: f.lat,
      lon: f.lon,
      color: STATUS_COLOR[statuses[f.id] ?? "pending"],
      label: String(i + 1),
      data: { f },
    })),
  );
</script>

<div class="relative h-full w-full {className}">
  <MapView
    class="hero-map"
    {center}
    {zoom}
    lockToOpeningView
    cooperativeGestures
    maxZoom={18}
    line={DC_ROUTE}
    {markers}
    centerOnSelect
    hidePlaceLabels
    {markerPopup}
  />
</div>

{#snippet markerPopup(m: MapMarker)}
  {@const f = (m.data as { f: Fountain }).f}
  <PointPopup
    fountain={f}
    loggedIn
    edit={edits[f.id]}
    busy={false}
    onAction={(action, extras) => record(f, action, extras)}
  />
{/snippet}
