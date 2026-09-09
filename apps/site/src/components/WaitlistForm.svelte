<script lang="ts">
  import { z } from "zod";
  import ErrorNotice from "./ErrorNotice.svelte";

  // Waitlist sign-up form, rendered on /waitlist. Collects name + email and posts
  // to Formspree (a hosted form backend), so signups land in the Formspree
  // dashboard/inbox with no server code of our own. Endpoint comes from a
  // PUBLIC_ env var so it's swappable per environment.
  const FORMSPREE = import.meta.env.PUBLIC_FORMSPREE_ENDPOINT as string | undefined;

  // The slice of Formspree's JSON error body we read. Anything else (or a
  // non-JSON body) falls through to the generic message.
  const formspreeError = z.object({
    errors: z.array(z.object({ message: z.string() })).optional(),
  });

  let name = $state("");
  let email = $state("");
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

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
      // redirecting to its own thank-you page, so the user stays on this page.
      const res = await fetch(FORMSPREE, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (res.ok) {
        status = "success";
        return;
      }
      const parsed = formspreeError.safeParse(await res.json().catch(() => null));
      status = "error";
      errorMsg =
        (parsed.success && parsed.data.errors?.[0]?.message) ||
        "Something went wrong. Please try again.";
    } catch {
      status = "error";
      errorMsg = "Network error. Please try again.";
    }
  }
</script>

{#if status === "success"}
  <p class="text-muted text-lg leading-relaxed" role="status">
    You're on the waitlist — we'll be in touch as we roll out access. Thanks for helping map and
    verify fountains in your community.
  </p>
{:else}
  <form onsubmit={submit} class="flex flex-col gap-4">
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
