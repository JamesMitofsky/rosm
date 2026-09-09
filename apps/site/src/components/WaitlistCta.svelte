<script lang="ts">
  import { UserPlus, X } from "phosphor-svelte";
  import ErrorNotice from "./ErrorNotice.svelte";

  // Landing-page CTA: the nav "Waitlist" button plus the waitlist modal it
  // opens. The modal also opens from the nav button in a separate Astro island, which
  // dispatches an `open-waitlist-modal` window event that this component listens for.
  //
  // Built on the native <dialog> element opened with showModal(): the browser renders
  // the dialog and its ::backdrop in the top layer, which composites backdrop-filter
  // stably over the WebGL map behind it (a plain overlay loses the blur when its GPU
  // layer un-promotes at the end of a transition). showModal() also gives Escape-to-
  // close, focus trapping/restore, aria-modal semantics, an inert background, and
  // stacking above the sticky nav for free. Backdrop click dismisses; body scroll is
  // locked via a CSS `html:has(dialog[open])` rule in globals.css.
  //
  // The modal collects name + email and posts to Formspree (a hosted form backend),
  // so signups land in the Formspree dashboard/inbox with no server code of our own.
  // Endpoint comes from a PUBLIC_ env var so it's swappable per environment.
  const FORMSPREE = import.meta.env.PUBLIC_FORMSPREE_ENDPOINT as string | undefined;

  let { size = "default", inverted = false }: { size?: "sm" | "default"; inverted?: boolean } =
    $props();

  let dialogEl = $state<HTMLDialogElement>();

  let name = $state("");
  let email = $state("");
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

  function close() {
    dialogEl?.close();
  }

  // Runs on the dialog's native `close` event (Escape, close(), backdrop click), so a
  // reopened modal always starts clean.
  function reset() {
    status = "idle";
    errorMsg = "";
  }

  // Open on the cross-island event dispatched by the mobile nav (MobileNav.svelte).
  $effect(() => {
    const onOpen = () => dialogEl?.showModal();
    window.addEventListener("open-waitlist-modal", onOpen);
    return () => window.removeEventListener("open-waitlist-modal", onOpen);
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!FORMSPREE) {
      status = "error";
      errorMsg = "Sign-up isn't configured yet. Please try again later.";
      return;
    }
    status = "submitting";
    errorMsg = "";
    try {
      // `Accept: application/json` makes Formspree return JSON instead of
      // redirecting to its own thank-you page, so the user stays in the modal.
      const res = await fetch(FORMSPREE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (res.ok) {
        status = "success";
      } else {
        const data = await res.json().catch(() => null);
        status = "error";
        errorMsg = data?.errors?.[0]?.message ?? "Something went wrong. Please try again.";
      }
    } catch {
      status = "error";
      errorMsg = "Network error. Please try again.";
    }
  }
</script>

<button
  type="button"
  onclick={() => dialogEl?.showModal()}
  class={// The small variant is a nav item: same link treatment as its neighbours
  // (blue on hover, inherited face). The default is the filled
  // call-to-action that sits in body copy.
  size === "sm"
    ? "nav-link"
    : [
        "inline-flex items-center gap-2 self-start rounded-xl border border-transparent px-4 py-2.5 text-base font-bold transition md:gap-2.5 md:px-4 md:py-3 md:text-lg",
        inverted ? "bg-white text-blue hover:bg-white/90" : "bg-blue text-white hover:bg-[#0a6fa3]",
      ].join(" ")}
>
  <UserPlus class={size === "sm" ? "h-4 w-4" : "h-5 w-5 md:h-6 md:w-6"} weight="fill" />
  <!-- Nav item keeps to one word like its neighbours; the body-copy button
       spells out the ask. -->
  {size === "sm" ? "Waitlist" : "Join the waitlist"}
</button>

<dialog
  bind:this={dialogEl}
  onclick={(e) => {
    if (e.target === dialogEl) close();
  }}
  onclose={reset}
  aria-labelledby="join-waitlist-title"
  class="font-body bg-surface text-base border-base/10 m-auto w-full max-w-md rounded-xl border p-8 shadow-2xl backdrop:bg-base/40 backdrop:backdrop-blur-sm"
>
  <button
    type="button"
    onclick={close}
    aria-label="Close"
    class="text-muted hover:text-base absolute top-4 right-4 transition"
  >
    <X class="h-5 w-5" weight="bold" />
  </button>

  <h2 id="join-waitlist-title" class="text-hero text-2xl font-semibold tracking-tight">Join the waitlist</h2>

  {#if status === "success"}
    <p class="text-muted mt-4 text-lg leading-relaxed">
      You're on the waitlist — we'll be in touch as we roll out access. Thanks for helping map and
      verify fountains in your community.
    </p>
  {:else}
    <p class="text-muted mt-4 text-lg leading-relaxed">
      We're opening access in waves. Add yourself to the waitlist and we'll send an invite when your spot comes up.
    </p>

    <form onsubmit={submit} class="mt-6 flex flex-col gap-4">
      <label class="flex flex-col gap-1.5">
        <span class="text-base text-sm font-medium">Name</span>
        <input
          type="text"
          bind:value={name}
          required
          autocomplete="name"
          class="bg-surface text-base border-base/15 focus:border-link focus:ring-link/30 rounded-sm border px-4 py-2.5 text-base transition outline-none focus:ring-2"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-base text-sm font-medium">Email</span>
        <input
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          class="bg-surface text-base border-base/15 focus:border-link focus:ring-link/30 rounded-sm border px-4 py-2.5 text-base transition outline-none focus:ring-2"
        />
      </label>

      {#if status === "error"}
        <ErrorNotice message={errorMsg} tone="light" />
      {/if}

      <button
        type="submit"
        disabled={status === "submitting"}
        class="mt-2 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue px-6 py-3 text-lg font-bold text-white transition hover:bg-[#0a6fa3] disabled:opacity-60"
      >
        {status === "submitting" ? "Joining…" : "Join the waitlist"}
      </button>
    </form>
  {/if}
</dialog>

<style>
  /* Enter/exit animation for the top-layer dialog. `allow-discrete` lets `display`
     and `overlay` (the top-layer property) animate so the element stays visible
     through its exit; `@starting-style` gives the pre-open values to animate from.
     The card fades + rises; the ::backdrop just fades. Browsers without these
     features simply show/hide instantly — never a broken state. */
  dialog {
    opacity: 0;
    translate: 0 8px;
    will-change: translate, opacity;
    transition:
      opacity 200ms ease,
      translate 200ms ease,
      overlay 200ms ease allow-discrete,
      display 200ms ease allow-discrete;
  }

  dialog[open] {
    opacity: 1;
    translate: 0 0;
  }

  @starting-style {
    dialog[open] {
      opacity: 0;
      translate: 0 8px;
    }
  }

  dialog::backdrop {
    opacity: 0;
    transition:
      opacity 200ms ease,
      overlay 200ms ease allow-discrete,
      display 200ms ease allow-discrete;
  }

  dialog[open]::backdrop {
    opacity: 1;
  }

  @starting-style {
    dialog[open]::backdrop {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    dialog,
    dialog::backdrop {
      transition: none;
      translate: none;
    }
  }
</style>
