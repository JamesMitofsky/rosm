<script module lang="ts">
  // What the panel knows about the walk to the selected fountain.
  export type RouteState =
    | { status: "loading" }
    | { status: "ok"; distanceM: number; minutes: number }
    | { status: "error"; message: string; island: boolean }
    // The visitor hasn't shared a location, so there is no "from" to route.
    | { status: "no-location" };
</script>

<script lang="ts">
  import {
    ArrowSquareOutIcon,
    CircleNotchIcon,
    PersonSimpleWalkIcon,
    XIcon,
  } from "phosphor-svelte";
  import type { Fountain } from "@rosm/core/schemas";
  import { fountainName } from "@rosm/core/fountainFilters";
  import { fmtDist, fmtWalkTime } from "@rosm/core/geo";
  import GlassCard from "@/components/GlassCard.svelte";

  // The bar under the map once a fountain is selected: where you're walking,
  // how far, how long — and the hand-off to the phone's maps app for actual
  // turn-by-turn. That link is always present, whatever the in-app route did:
  // it is the one thing that keeps working when routing fails, and the reason
  // a failed route is a note here rather than a dead end.
  let {
    f,
    route,
    mapsHref,
    onClose,
  }: {
    f: Fountain;
    route: RouteState;
    mapsHref: string;
    onClose: () => void;
  } = $props();
</script>

<GlassCard class="flex w-full max-w-sm items-center gap-3 py-2 pr-1.5 pl-3.5">
  <PersonSimpleWalkIcon size={22} weight="bold" class="shrink-0 text-neutral-700" />
  <div class="min-w-0 flex-1 leading-tight">
    <div class="truncate text-sm font-semibold text-neutral-900">{fountainName(f)}</div>
    <div class="mt-0.5 text-xs text-neutral-600">
      {#if route.status === "ok"}
        {fmtDist(route.distanceM)} · {fmtWalkTime(route.minutes)} walk
      {:else if route.status === "loading"}
        <span class="inline-flex items-center gap-1">
          <CircleNotchIcon size={12} class="animate-spin" /> Finding a walking route…
        </span>
      {:else if route.status === "no-location"}
        Share your location for a walking route, or open in Maps.
      {:else}
        {route.message}
      {/if}
    </div>
  </div>
  <a
    href={mapsHref}
    target="_blank"
    rel="noopener"
    aria-label="Open in Maps"
    title="Open in Maps"
    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-800 transition hover:bg-neutral-900/5 active:scale-95"
  >
    <ArrowSquareOutIcon size={20} weight="bold" />
  </a>
  <button
    type="button"
    aria-label="Close"
    title="Close"
    onclick={onClose}
    class="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-900/5 active:scale-95"
  >
    <XIcon size={18} weight="bold" />
  </button>
</GlassCard>
