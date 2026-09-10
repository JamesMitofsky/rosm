<script lang="ts">
  import { NavigationArrowIcon, WrenchIcon } from "phosphor-svelte";
  import DogIcon from "@/components/icons/DogIcon.svelte";
  import type { Fountain } from "@rosm/core/schemas";
  import { fountainName, isDogWater, isOutOfService } from "@rosm/core/fountainFilters";
  import { checkedAgoLabel } from "@rosm/core/checkDate";
  import { bearing, compass, fmtDist, haversine, type Pt } from "@rosm/core/geo";

  // Read-only popup: name, how far (once we know where the visitor is), last-
  // checked date, status flags. No edit controls — this view is purely for
  // finding water nearby.
  let {
    f,
    userPos = null,
    onDirections,
  }: {
    f: Fountain;
    // The visitor's fix, if they've shared one. With it the popup shows the
    // straight-line distance and which way to look; the walking route itself
    // lives in the panel under the map, which the parent opens on selection.
    userPos?: Pt | null;
    // Without a fix there is no route yet — this asks for one. Only rendered
    // in that state: once located, selecting a fountain already routes to it.
    onDirections?: () => void;
  } = $props();

  // Snapshot the clock once — the "checked ago" label doesn't need to tick live.
  const now = Date.now();

  const distance = $derived(
    userPos ? `${fmtDist(haversine(userPos, f))} ${compass(bearing(userPos, f))}` : null,
  );
</script>

<div class="flex w-52 flex-col gap-1 text-neutral-800">
  <div class="flex items-start justify-between gap-2">
    <div class="min-w-0">
      <div class="leading-tight font-semibold">{fountainName(f)}</div>
      <div class="mt-0.5 text-xs text-neutral-600">
        {#if distance}
          {distance} · {checkedAgoLabel(f.tags, now)}
        {:else}
          {checkedAgoLabel(f.tags, now)}
        {/if}
      </div>
    </div>
    {#if !userPos && onDirections}
      <button
        type="button"
        aria-label="Directions"
        title="Directions"
        onclick={onDirections}
        class="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-800 transition hover:bg-neutral-900/5 active:scale-95"
      >
        <NavigationArrowIcon size={18} weight="fill" />
      </button>
    {/if}
  </div>
  {#if isDogWater(f.tags)}
    <div class="mt-1 flex items-center gap-1 text-xs font-medium text-violet-700">
      <DogIcon size={14} /> Dog water — not for humans
    </div>
  {/if}
  {#if isOutOfService(f.tags)}
    <div class="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700">
      <WrenchIcon size={14} /> Out of order
    </div>
  {/if}
</div>
