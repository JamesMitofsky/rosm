<script module lang="ts">
  export type LocateState = "idle" | "locating" | "denied" | "unavailable";
</script>

<script lang="ts">
  import { CircleNotchIcon, GpsFixIcon } from "phosphor-svelte";
  import GlassCard from "@/components/GlassCard.svelte";

  // The page's one call to action for a visitor who hasn't shared their
  // location: tap, allow, and the map goes to them.
  //
  // It carries a label, against the site's icon-only habit, on purpose. The
  // map already has an icon-only locate button (MapLibre's, top-right) and
  // first-time phone visitors don't find it — this exists precisely because
  // the icon alone wasn't enough. Once a fix arrives the parent unmounts it.
  let {
    state,
    onLocate,
    onNoteExpired,
  }: {
    state: LocateState;
    onLocate: () => void;
    // The denied/unavailable note has been on screen long enough; the parent
    // should drop back to `idle` so the button can be tried again.
    onNoteExpired?: () => void;
  } = $props();

  const NOTE_MS = 5000;
  const failed = $derived(state === "denied" || state === "unavailable");

  $effect(() => {
    if (!failed) return;
    const t = setTimeout(() => onNoteExpired?.(), NOTE_MS);
    return () => clearTimeout(t);
  });
</script>

{#if failed}
  <GlassCard class="max-w-xs px-4 py-2.5 text-center text-xs text-neutral-700">
    {#if state === "denied"}
      Location is blocked for this site — allow it in your browser settings to find fountains near
      you.
    {:else}
      Couldn't get your location. Check that location services are on and try again.
    {/if}
  </GlassCard>
{:else}
  <GlassCard class="overflow-hidden">
    <button
      type="button"
      class="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900/5 active:scale-[0.98] disabled:opacity-60"
      disabled={state === "locating"}
      onclick={onLocate}
    >
      {#if state === "locating"}
        <CircleNotchIcon size={18} class="animate-spin" />
        Finding you…
      {:else}
        <GpsFixIcon size={18} weight="bold" />
        Find fountains near me
      {/if}
    </button>
  </GlassCard>
{/if}
