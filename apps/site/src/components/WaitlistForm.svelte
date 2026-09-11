<script lang="ts">
  import ErrorNotice from "./ErrorNotice.svelte";
  import { submitToFormspree } from "@/lib/formspree";
  import { FIELD_CLASS, LABEL_CLASS, SUBMIT_CLASS } from "@/lib/formClasses";

  // Waitlist sign-up form, rendered on /waitlist. Collects name + email and
  // posts to Formspree, so signups land in its inbox with no server code of
  // our own.
  const ENDPOINT = import.meta.env.PUBLIC_FORMSPREE_ENDPOINT as string | undefined;

  let name = $state("");
  let email = $state("");
  let status = $state<"idle" | "submitting" | "success" | "error">("idle");
  let errorMsg = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    status = "submitting";
    errorMsg = "";
    const result = await submitToFormspree(
      ENDPOINT,
      { name, email },
      "Sign-up isn't configured yet. Please try again later.",
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
    You're on the waitlist — we'll be in touch as we roll out access. Thanks for helping map and
    verify fountains in your community.
  </p>
{:else}
  <form onsubmit={submit} class="flex flex-col gap-4">
    <label class="flex flex-col gap-1.5">
      <span class={LABEL_CLASS}>Name</span>
      <input type="text" bind:value={name} required autocomplete="name" class={FIELD_CLASS} />
    </label>

    <label class="flex flex-col gap-1.5">
      <span class={LABEL_CLASS}>Email</span>
      <input type="email" bind:value={email} required autocomplete="email" class={FIELD_CLASS} />
    </label>

    {#if status === "error"}
      <ErrorNotice message={errorMsg} tone="light" />
    {/if}

    <button type="submit" disabled={status === "submitting"} class={SUBMIT_CLASS}>
      {status === "submitting" ? "Joining…" : "Join the waitlist"}
    </button>
  </form>
{/if}
