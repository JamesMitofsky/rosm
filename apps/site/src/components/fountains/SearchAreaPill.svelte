<script lang="ts">
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { prefersReducedMotion } from "svelte/motion";
  import { CircleNotchIcon, MagnifyingGlassIcon } from "phosphor-svelte";
  import GlassCard from "@/components/GlassCard.svelte";

  // "Search this area": the map has drifted far enough from the last query that
  // the dots on screen no longer describe it. Shown only then (the parent gates
  // on `movedEnough`), so its appearance is itself the signal.
  let {
    visible,
    busy = false,
    tooLarge = false,
    onSearch,
  }: {
    visible: boolean;
    busy?: boolean;
    // The viewport is wider than the API will search; the pill stays as a hint
    // to zoom in rather than vanishing without explanation.
    tooLarge?: boolean;
    onSearch: () => void;
  } = $props();

  // Svelte transitions don't consult the media query on their own.
  const ms = (n: number) => (prefersReducedMotion.current ? 0 : n);
</script>

{#if visible}
  <div transition:fly={{ y: -8, duration: ms(200), easing: cubicOut }}>
    <GlassCard class="overflow-hidden">
      <button
        type="button"
        class="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-900/5 active:scale-[0.98] disabled:opacity-60"
        disabled={busy || tooLarge}
        onclick={onSearch}
      >
        {#if busy}
          <CircleNotchIcon size={16} class="animate-spin" />
          Searching…
        {:else if tooLarge}
          <MagnifyingGlassIcon size={16} weight="bold" />
          Zoom in to search
        {:else}
          <MagnifyingGlassIcon size={16} weight="bold" />
          Search this area
        {/if}
      </button>
    </GlassCard>
  </div>
{/if}
