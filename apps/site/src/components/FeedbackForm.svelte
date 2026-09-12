<script lang="ts">
  import ErrorNotice from "./ErrorNotice.svelte";
  import { submitToFormspree } from "@/lib/formspree";
  import { FIELD_CLASS, LABEL_CLASS, SUBMIT_CLASS } from "@/lib/formClasses";

  // Feedback form, rendered on /feedback. Its own Formspree endpoint rather
  // than the waitlist's, so bug reports don't land in the sign-up inbox.
  const ENDPOINT = import.meta.env.PUBLIC_FORMSPREE_FEEDBACK_ENDPOINT as string | undefined;

  let message = $state("");
  let email = $state("");
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    status = "submitting";
    errorMsg = "";
    const result = await submitToFormspree(
      ENDPOINT,
      // Email is optional — send it only when given, so a blank field doesn't
      // show up in the inbox as an empty column.
      { message, ...(email ? { email } : {}) },
      "Feedback isn't configured yet. Please try again later.",
    );
    if (result.ok) {
      status = "success";
      return;
    }
    status = "error";
    errorMsg = result.message;
  }
</script>

{#if status === "success"}
  <p class="text-muted text-lg leading-relaxed" role="status">
    Thanks! If you left an email, we'll definitely follow up.
  </p>
{:else}
  <form onsubmit={submit} class="flex flex-col gap-4">
    <label class="flex flex-col gap-1.5">
      <span class={LABEL_CLASS}
        >What's on your mind? <span class="text-muted font-normal">*</span></span
      >
      <textarea
        bind:value={message}
        required
        rows="6"
        placeholder="Something go wrong? Something go RIGHT‽  Let us know :)"
        class="{FIELD_CLASS} resize-y"></textarea>
    </label>

    <label class="flex flex-col gap-1.5">
      <span class={LABEL_CLASS}> Email </span>
      <input
        type="email"
        bind:value={email}
        autocomplete="email"
        placeholder="you@example.com"
        class={FIELD_CLASS}
      />
    </label>

    {#if status === "error"}
      <ErrorNotice message={errorMsg} tone="light" />
    {/if}

    <button type="submit" disabled={status === "submitting"} class={SUBMIT_CLASS}>
      {status === "submitting" ? "Sharing…" : "Share feedback"}
    </button>
  </form>
{/if}
