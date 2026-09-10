<script lang="ts">
  import { WrenchIcon } from "phosphor-svelte";
  import DogIcon from "@/components/icons/DogIcon.svelte";
  import { HIDE_KEYS, type HideKey } from "@rosm/core/fountainFilters";

  // One pill per hideable class of fountain. A pill is *on* while its
  // fountains are shown — the default — and struck through once hidden, so
  // the row reads as "what's on the map" rather than "what's filtered".
  //
  // Each pill carries how many fountains it governs, counted over the full
  // result set (not just what's currently visible), so the number tells the
  // visitor what the toggle costs and doesn't jump when a neighbour flips.
  let {
    hidden,
    counts,
    onToggle,
    class: className = "",
  }: {
    hidden: ReadonlySet<HideKey>;
    counts: Record<HideKey, number>;
    onToggle: (key: HideKey) => void;
    class?: string;
  } = $props();

  const LABEL: Record<HideKey, string> = {
    out_of_order: "Out of order",
    dog_water: "Dog water",
  };
</script>

<div class="flex flex-wrap items-center gap-1.5 {className}">
  {#each HIDE_KEYS as key (key)}
    {@const shown = !hidden.has(key)}
    {@const n = counts[key]}
    <button
      type="button"
      aria-pressed={shown}
      disabled={n === 0}
      onclick={() => onToggle(key)}
      class={[
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition",
        shown
          ? "border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50"
          : "border-neutral-200 bg-transparent text-neutral-500 hover:bg-neutral-100",
        "disabled:cursor-default disabled:opacity-40",
      ]}
    >
      {#if key === "out_of_order"}
        <WrenchIcon size={12} />
      {:else}
        <DogIcon size={12} />
      {/if}
      <!-- Struck on the label only: a decoration on the button would run
           through the count, and a struck number reads as "zero". -->
      <span class={{ "line-through": !shown && n > 0 }}>{LABEL[key]}</span>
      <span class="text-muted text-[10px] tabular-nums">{n}</span>
    </button>
  {/each}
</div>
