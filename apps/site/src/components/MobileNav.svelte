<script lang="ts">
  import { List, X, MapTrifold, House, Bell } from "phosphor-svelte";
  import { fade, fly, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { prefersReducedMotion } from "svelte/motion";

  // Mobile-only nav. The desktop header renders the "Map" link and the
  // WaitlistCta button inline; below `sm` those are hidden and this hamburger takes over.
  // "Waitlist" reuses the existing waitlist modal (rendered by WaitlistCta in the header)
  // by dispatching the same `open-waitlist-modal` window event its $effect listens for —
  // no second dialog instance.
  // `currentPath` marks the row for the page the visitor is on (see Layout).
  let { inverted = false, currentPath = "" }: { inverted?: boolean; currentPath?: string } = $props();
  let open = $state(false);

  // Svelte transitions don't consult the media query on their own, so every
  // duration below goes through this — reduced motion collapses them to a cut.
  const ms = (n: number) => (prefersReducedMotion.current ? 0 : n);

  function openWaitlist() {
    open = false;
    window.dispatchEvent(new Event("open-waitlist-modal"));
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
      ? "trigger inline-flex items-center justify-center rounded-xl p-2 text-white transition duration-200 ease-out hover:bg-white/10 active:scale-95"
      : "trigger inline-flex items-center justify-center rounded-xl p-2 text-blue transition duration-200 ease-out hover:bg-blue/5 active:scale-95"}
  >
    <!-- Both glyphs share one grid cell so they can cross-fade and counter-rotate
         through each other rather than popping in place. -->
    <span class="grid h-8 w-8 place-items-center">
      <span class="icon" class:hidden-icon={open}>
        <List class="h-8 w-8" weight="regular" />
      </span>
      <span class="icon" class:hidden-icon={!open}>
        <X class="h-8 w-8" weight="regular" />
      </span>
    </span>
  </button>

  {#if open}
    <!-- Backdrop closes the menu on outside tap. -->
    <button
      type="button"
      aria-label="Close menu"
      tabindex="-1"
      onclick={() => (open = false)}
      transition:fade={{ duration: ms(160) }}
      class="fixed inset-0 z-40 cursor-default"
    ></button>

    <!-- Grows out of the trigger it hangs from (origin top-right), so the menu
         reads as unfolding from the button rather than appearing over it. -->
    <div
      transition:scale={{
        duration: ms(190),
        start: 0.94,
        opacity: 0,
        easing: cubicOut,
      }}
      class="font-hero absolute right-0 top-full z-50 mt-2 flex w-56 origin-top-right flex-col gap-1 rounded-xl border border-base/10 bg-surface p-2 shadow-xl"
    >
      <!-- Rows land in reading order. Only on the way in: leaving, the panel
           scales away as one piece and per-item exits would fight that. -->
      <a
        href="/"
        onclick={() => (open = false)}
        aria-current={currentPath === "/" ? "page" : undefined}
        in:fly={{ y: -6, duration: ms(220), delay: ms(50), easing: cubicOut }}
        class="row inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-lg text-light-muted transition duration-200 ease-out hover:bg-blue/5 hover:text-blue current-page:text-blue"
      >
        <House class="h-5 w-5" weight="fill" />
        Home
      </a>
      <a
        href="/dc-drinking-fountains"
        onclick={() => (open = false)}
        aria-current={currentPath === "/dc-drinking-fountains" ? "page" : undefined}
        in:fly={{ y: -6, duration: ms(220), delay: ms(95), easing: cubicOut }}
        class="row inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-lg text-light-muted transition duration-200 ease-out hover:bg-blue/5 hover:text-blue current-page:text-blue"
      >
        <MapTrifold class="h-5 w-5" weight="fill" />
        Map
      </a>
      <button
        type="button"
        onclick={openWaitlist}
        in:fly={{ y: -6, duration: ms(220), delay: ms(140), easing: cubicOut }}
        class="row inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-lg text-light-muted transition duration-200 ease-out hover:bg-blue/5 hover:text-blue current-page:text-blue"
      >
        <Bell class="h-5 w-5" weight="fill" />
        Waitlist
      </button>
    </div>
  {/if}
</div>

<style>
  /* Both icons occupy the same grid cell; only opacity/transform differ. */
  .icon {
    grid-area: 1 / 1;
    display: inline-flex;
    transition:
      opacity 200ms cubic-bezier(0.22, 1, 0.36, 1),
      transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .hidden-icon {
    opacity: 0;
    /* Rotates the opposite way from its partner so the swap looks like one
       glyph turning into the other. */
    transform: rotate(-90deg) scale(0.7);
  }

  /* The row's icon leads the hover a hair ahead of the background fill. */
  .row :global(svg) {
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .row:hover :global(svg) {
    transform: translateX(2px);
  }

  @media (prefers-reduced-motion: reduce) {
    .icon,
    .row :global(svg) {
      transition: none;
    }
    .hidden-icon {
      transform: none;
    }
    .row:hover :global(svg) {
      transform: none;
    }
  }
</style>
