<script lang="ts">
  import { X } from "phosphor-svelte";
  import ErrorNotice from "./ErrorNotice.svelte";

  // Landing-page CTA: the hero "Join the Beta" button plus the beta sign-up modal it
  // opens. The modal also opens from the nav button in a separate Astro island, which
  // dispatches an `open-beta-modal` window event that this component listens for.
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

  let { size = "default" }: { size?: "sm" | "default" } = $props();

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

  // Open on the cross-island event dispatched by the nav button (SiteNav.astro).
  $effect(() => {
    const onOpen = () => dialogEl?.showModal();
    window.addEventListener("open-beta-modal", onOpen);
    return () => window.removeEventListener("open-beta-modal", onOpen);
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
  class={[
    "inline-flex items-center rounded-xl bg-blue font-bold text-white transition hover:bg-[#0a6fa3]",
    size === "sm"
      ? "gap-2 px-4 py-2 text-sm self-start"
      : "gap-2.5 px-6 py-3 text-lg self-end md:self-start",
  ].join(" ")}
>
  <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" class={size === "sm" ? "h-4 w-4" : "h-6 w-6"}>
    <path
      d="M29.1,60.6L11.7,87.9c-1.8,2.9-1,6.7,1.9,8.6c1,0.7,2.2,1,3.3,1c2,0,4.1-1,5.2-2.9l17.1-26.8l-4.6-2.2C32.2,64.5,30.3,62.8,29.1,60.6z"
    ></path>
    <circle cx="70.8" cy="13.4" r="10.9"></circle>
    <path
      d="M89.1,44.2c-0.8-2.8-3.6-4.4-6.4-3.6l-7.7,2.1l-3.7-8.4c-1.1-2.5-2.9-4.6-5.2-6.1l-8.9-5.8c-2.6-1.7-5.8-2.5-8.9-2.3l-13.1,1c-1.4,0.1-2.6,0.8-3.5,1.8l-8.9,10.5c-1.9,2.2-1.6,5.4,0.6,7.3c2.2,1.9,5.4,1.6,7.3-0.6l7.5-8.8l7.8-0.6L34.7,50.9c-0.8,1.5-1,3.3-0.5,4.9c0.5,1.6,1.7,3,3.3,3.7l17.5,8.2L45.2,81c-2,2.8-1.4,6.7,1.3,8.7c1.1,0.8,2.4,1.2,3.7,1.2c1.9,0,3.8-0.9,5-2.5L69.4,69c1.1-1.5,1.5-3.4,1-5.2c-0.5-1.8-1.7-3.3-3.4-4.1L54.8,54l8.4-12.4l4.2,9.5c0.8,1.9,2.7,3.1,4.7,3.1c0.5,0,0.9-0.1,1.4-0.2l12-3.3C88.3,49.8,89.9,46.9,89.1,44.2z"
    ></path>
  </svg>
  Contribute
</button>

<dialog
  bind:this={dialogEl}
  onclick={(e) => {
    if (e.target === dialogEl) close();
  }}
  onclose={reset}
  aria-labelledby="join-beta-title"
  class="bg-surface text-base border-base/10 m-auto w-full max-w-md rounded-xl border p-8 shadow-2xl backdrop:bg-base/40 backdrop:backdrop-blur-sm"
>
  <button
    type="button"
    onclick={close}
    aria-label="Close"
    class="text-muted hover:text-base absolute top-4 right-4 transition"
  >
    <X class="h-5 w-5" weight="bold" />
  </button>

  <h2 id="join-beta-title" class="font-hero text-hero text-3xl font-bold tracking-tight">Contribute</h2>

  {#if status === "success"}
    <p class="text-muted mt-4 text-lg leading-relaxed">
      You're on the list — we'll be in touch as we roll out access. Thanks for helping map and
      verify fountains in your community.
    </p>
  {:else}
    <p class="text-muted mt-4 text-lg leading-relaxed">
      The run app is working... mostly! If you're all about improving that H20-access and down to
      share feedback, add your info and I'll send an invite!
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
        {status === "submitting" ? "Joining…" : "Join the Beta"}
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
