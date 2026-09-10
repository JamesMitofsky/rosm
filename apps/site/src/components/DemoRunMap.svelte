<script lang="ts">
  import MapView, { MARKER_POP_MS, type MapMarker } from "@/components/MapView.svelte";
  import PointPopup, { type PointEdit } from "@/components/PointPopup.svelte";
  import type { EditAction, EditExtras, Fountain } from "@rosm/core/schemas";
  import type { StopStatus } from "@rosm/core/stores/run";
  import { editSummary, todayLocal } from "@rosm/core/editSummary";
  import { celebratePoint } from "@/lib/confetti";
  import { MAP_REVEAL_MS, openingViewForViewport } from "@/lib/basemap/frames";
  import {
    DC_FOUNTAINS,
    DC_ROUTE,
    DEMO_NEXT_STOP,
    STATUS_COLOR,
    SEED_STATUSES,
  } from "@/lib/demoRoute";
  import {
    DEMO_ARRIVALS,
    DEMO_CHECKPOINTS,
    DEMO_ROUTE_LENGTHS,
    DEMO_SEEDED_IN_ORDER,
    demoRunnerAt,
  } from "@/lib/demoRun";
  import { arrivalMs, legSchedule, lengthAt } from "@/lib/runReplay";

  // Interactive replica of the run screen for the landing hero. Every tap flows
  // through the real PointPopup, but edits only touch local state — nothing is
  // sent to OSM, queued in the outbox, or persisted anywhere.
  //
  // On load it replays the run so far: the line draws itself from the first
  // stop with the runner at its tip, slowing into each surveyed stop — which
  // flips from pending to its status as the runner reaches it — and setting
  // off again, until it halts at the next stop (`DEMO_NEXT_STOP`, at
  // `DEMO_RUN_END`) with the rest of the loop left faint as the plan. The
  // moment it stops there, that stop's popup springs open, unmarked: the
  // visitor is handed the run exactly where a runner would reach for their
  // phone. The replay is presentation only; the seeded statuses it reveals
  // are the same ones the map used to show from the first frame.
  let { class: className = "" }: { class?: string } = $props();

  // The opening view is initial-only, so pick it once at mount. Read from the
  // frame spec rather than restated here: this map dissolves out of a picture
  // rendered at exactly that centre and zoom, and two copies of either number
  // are two things to keep in step. The centre is not the route's own — the
  // spec shifts it so the route sits clear of the hero copy painted over the
  // map (see `frames.ts`).
  const { center, zoom } = openingViewForViewport("demo-run");

  /**
   * How long the replay takes to run from the first stop to `DEMO_RUN_END`.
   * Short: the hero's copy is what the visitor came for, and the popup that
   * opens at the end is the replay's point, so the run is a prelude, not a
   * feature.
   */
  const RUN_MS = 2200;
  /**
   * Pause between the loading frame clearing and the replay starting, so the
   * visitor sees a settled map before anything on it moves: the frame's
   * dissolve, the dots' own pop-in, and a beat.
   */
  const HOLD_MS = MAP_REVEAL_MS + MARKER_POP_MS + 150;
  /** How long a stop's ping lasts once the runner reaches it. */
  const PULSE_MS = 550;

  /**
   * The replay's clock: one leg per stretch between checkpoints, each eased
   * in and out so the runner leaves a stop, gets up to pace, and slows into
   * the next (`runReplay.ts`). The time is shared out by distance, so the
   * pace is the same on every leg.
   */
  const LEGS = legSchedule(DEMO_CHECKPOINTS, RUN_MS);

  /** When, in ms after the replay starts, the runner reaches each surveyed stop. */
  const ARRIVAL_MS: Record<number, number> = Object.fromEntries(
    DEMO_SEEDED_IN_ORDER.map((id) => [id, arrivalMs(LEGS, DEMO_ARRIVALS[id]) ?? 0]),
  );

  const seededEdit = (id: number): PointEdit => ({
    status: SEED_STATUSES[id],
    summary: editSummary(SEED_STATUSES[id] as EditAction, "amenity", todayLocal()),
    syncState: "sent",
  });
  /** What the popup shows for a surveyed stop once the replay has reached it. */
  const SEEDED_EDITS: Record<number, PointEdit> = Object.fromEntries(
    DEMO_SEEDED_IN_ORDER.map((id) => [id, seededEdit(id)]),
  );

  // The replay's clock. `idle` until the loading frame has cleared and the
  // hold has passed, `running` while the line draws, `done` after — or at
  // once, under reduced motion, in which case the map opens on the end frame.
  let phase = $state<"idle" | "running" | "done">("idle");
  let elapsed = $state(0);
  let ready = $state(false);

  $effect(() => {
    if (!ready || phase !== "idle") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      phase = "done";
      return;
    }
    // A replay in a background tab would run unseen and be over by the time
    // the visitor came back; wait for the tab instead.
    const start = () => {
      if (document.visibilityState === "hidden") {
        document.addEventListener("visibilitychange", start, { once: true });
        return;
      }
      phase = "running";
    };
    const timer = setTimeout(start, HOLD_MS);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", start);
    };
  });

  $effect(() => {
    if (phase !== "running") return;
    const startedAt = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = now - startedAt;
      if (t >= RUN_MS) {
        elapsed = RUN_MS;
        phase = "done";
        return;
      }
      elapsed = t;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  });

  // The marker whose popup is open, bound to the map's own selection so a tap
  // on the map (which sets or clears it) and the replay (below) share it.
  let selected = $state<string | null>(null);

  // The moment the runner halts, open the next stop's popup — no beat between
  // the two, so the popup reads as the arrival itself, not a consequence of
  // it. Also the path under reduced motion, where the map opens on the end
  // frame with the popup already up. Depends on `phase` alone, so it runs
  // once per arrival: a visitor who closes the popup does not have it reopen
  // on the next render.
  $effect(() => {
    if (phase === "done") selected = String(DEMO_NEXT_STOP);
  });

  // Per-frame values. Everything the map redraws every frame hangs off these
  // and *only* these — see `markers` below for what must not.
  const runElapsed = $derived(phase === "done" ? RUN_MS : phase === "idle" ? 0 : elapsed);
  const runLength = $derived(lengthAt(LEGS, runElapsed));
  const lineProgress = $derived(runLength / DEMO_ROUTE_LENGTHS.total);
  const runner = $derived(demoRunnerAt(runLength));

  // How many surveyed stops the runner has reached, in route order. A number,
  // so the derivations below it only re-run when a stop is actually reached —
  // not on every frame the line moves.
  const reachedCount = $derived(
    DEMO_SEEDED_IN_ORDER.filter((id) => DEMO_ARRIVALS[id] <= runLength).length,
  );

  // The visitor's own edits, over the replay's. Seeded state is not copied in
  // here: it is derived from how far the run has got, so a stop the runner has
  // not reached yet shows as pending however the seed data reads.
  let userEdits = $state<Record<number, PointEdit>>({});
  const visibleEdits = $derived.by<Record<number, PointEdit>>(() => {
    const revealed: Record<number, PointEdit> = {};
    for (const id of DEMO_SEEDED_IN_ORDER.slice(0, reachedCount)) revealed[id] = SEEDED_EDITS[id];
    return { ...revealed, ...userEdits };
  });

  function record(f: Fountain, action: EditAction, extras?: EditExtras) {
    userEdits = {
      ...userEdits,
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
      if (userEdits[f.id]) {
        userEdits = { ...userEdits, [f.id]: { ...userEdits[f.id], syncState: "sent" } };
      }
    }, 900);
  }

  // Rebuilt only when a stop's state changes (`visibleEdits`), never per frame:
  // a new marker set makes MapView re-upload the source and re-place every
  // label. The per-frame motion — the line, the runner, the pings — travels on
  // its own props.
  const markers = $derived<MapMarker[]>(
    DC_FOUNTAINS.map((f, i) => {
      const edit = visibleEdits[f.id];
      return {
        id: f.id,
        lat: f.lat,
        lon: f.lon,
        color: STATUS_COLOR[edit?.status ?? "pending"],
        label: String(i + 1),
        // The label pops again the moment the stop gets a status.
        popKey: edit ? 1 : 0,
        data: { f },
      };
    }),
  );

  // The ping each surveyed stop gives off as the runner reaches it: id → how
  // far through its ping it is. The same object whenever nothing is pinging,
  // so MapView's feature-state effect has nothing to do on those frames.
  const NO_PULSES: Record<string, number> = {};
  const pulses = $derived.by<Record<string, number>>(() => {
    if (phase !== "running") return NO_PULSES;
    let out: Record<string, number> | undefined;
    for (const id of DEMO_SEEDED_IN_ORDER) {
      const t = (elapsed - ARRIVAL_MS[id]) / PULSE_MS;
      if (t > 0 && t < 1) (out ??= {})[String(id)] = t;
    }
    return out ?? NO_PULSES;
  });
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
    {lineProgress}
    lineUpcoming
    {runner}
    {markers}
    {pulses}
    centerOnSelect
    bind:selected
    hidePlaceLabels
    onReady={() => (ready = true)}
    {markerPopup}
  />
</div>

{#snippet markerPopup(m: MapMarker)}
  {@const f = (m.data as { f: Fountain }).f}
  <PointPopup
    fountain={f}
    loggedIn
    edit={visibleEdits[f.id]}
    busy={false}
    onAction={(action, extras) => record(f, action, extras)}
  />
{/snippet}
