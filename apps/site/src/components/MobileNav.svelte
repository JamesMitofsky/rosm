<script lang="ts">
  import { List, X, Drop } from "phosphor-svelte";

  // Mobile-only nav. The desktop header renders the "Find Water" link and the
  // BetaCta button inline; below `sm` those are hidden and this hamburger takes over.
  // "Test the App" reuses the existing beta modal (rendered by BetaCta in the header)
  // by dispatching the same `open-beta-modal` window event its $effect listens for —
  // no second dialog instance.
  let { inverted = false }: { inverted?: boolean } = $props();
  let open = $state(false);

  function openBeta() {
    open = false;
    window.dispatchEvent(new Event("open-beta-modal"));
  }

  // Close on Escape and on click outside the menu.
  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") open = false;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<div class="relative">
  <button
    type="button"
    onclick={() => (open = !open)}
    aria-label={open ? "Close menu" : "Open menu"}
    aria-expanded={open}
    class={inverted
      ? "inline-flex items-center justify-center rounded-xl border border-white p-2 text-white transition hover:bg-white/10"
      : "inline-flex items-center justify-center rounded-xl border border-blue p-2 text-blue transition hover:bg-blue/5"}
  >
    {#if open}
      <X class="h-6 w-6" weight="bold" />
    {:else}
      <List class="h-6 w-6" weight="bold" />
    {/if}
  </button>

  {#if open}
    <!-- Backdrop closes the menu on outside tap. -->
    <button
      type="button"
      aria-label="Close menu"
      tabindex="-1"
      onclick={() => (open = false)}
      class="fixed inset-0 z-40 cursor-default"
    ></button>

    <div
      class="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-xl border border-base/10 bg-surface p-2 shadow-xl"
    >
      <a
        href="/dc-drinking-fountains"
        onclick={() => (open = false)}
        class="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-bold text-blue transition hover:bg-blue/5"
      >
        <Drop class="h-5 w-5" weight="fill" />
        Find Water
      </a>
      <button
        type="button"
        onclick={openBeta}
        class="inline-flex items-center gap-2.5 rounded-xl bg-blue px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a6fa3]"
      >
        <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" class="h-5 w-5">
            <path d="M29.1,60.6L11.7,87.9c-1.8,2.9-1,6.7,1.9,8.6c1,0.7,2.2,1,3.3,1c2,0,4.1-1,5.2-2.9l17.1-26.8l-4.6-2.2C32.2,64.5,30.3,62.8,29.1,60.6z"></path>
            <circle cx="70.8" cy="13.4" r="10.9"></circle>
            <path d="M89.1,44.2c-0.8-2.8-3.6-4.4-6.4-3.6l-7.7,2.1l-3.7-8.4c-1.1-2.5-2.9-4.6-5.2-6.1l-8.9-5.8c-2.6-1.7-5.8-2.5-8.9-2.3l-13.1,1c-1.4,0.1-2.6,0.8-3.5,1.8l-8.9,10.5c-1.9,2.2-1.6,5.4,0.6,7.3c2.2,1.9,5.4,1.6,7.3-0.6l7.5-8.8l7.8-0.6L34.7,50.9c-0.8,1.5-1,3.3-0.5,4.9c0.5,1.6,1.7,3,3.3,3.7l17.5,8.2L45.2,81c-2,2.8-1.4,6.7,1.3,8.7c1.1,0.8,2.4,1.2,3.7,1.2c1.9,0,3.8-0.9,5-2.5L69.4,69c1.1-1.5,1.5-3.4,1-5.2c-0.5-1.8-1.7-3.3-3.4-4.1L54.8,54l8.4-12.4l4.2,9.5c0.8,1.9,2.7,3.1,4.7,3.1c0.5,0,0.9-0.1,1.4-0.2l12-3.3C88.3,49.8,89.9,46.9,89.1,44.2z"></path>
          </svg>
        Contribute
      </button>
    </div>
  {/if}
</div>
