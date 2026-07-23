<script lang="ts">
  import { List, X, Drop, Barbell } from "phosphor-svelte";

  // Mobile-only nav. The desktop header renders the "Find Water Now" link and the
  // BetaCta button inline; below `sm` those are hidden and this hamburger takes over.
  // "Test the App" reuses the existing beta modal (rendered by BetaCta in the header)
  // by dispatching the same `open-beta-modal` window event its $effect listens for —
  // no second dialog instance.
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
    class="inline-flex items-center justify-center rounded-xl border border-blue p-2 text-blue transition hover:bg-blue/5"
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
        Find Water Now
      </a>
      <button
        type="button"
        onclick={openBeta}
        class="inline-flex items-center gap-2.5 rounded-xl bg-blue px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#0a6fa3]"
      >
        <Barbell class="h-5 w-5" weight="fill" />
        Contribute
      </button>
    </div>
  {/if}
</div>
