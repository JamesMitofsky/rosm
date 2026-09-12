import { z } from "zod";

// Formspree is a hosted form backend: the browser POSTs straight to an endpoint
// and submissions land in its dashboard/inbox, so the site keeps no server code
// and no database for them. Endpoints come from PUBLIC_ env vars (one per form)
// so each environment can point at its own inbox.

// The slice of Formspree's JSON error body we read. Anything else (or a
// non-JSON body) falls through to the generic message.
const formspreeError = z.object({
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export type FormspreeResult = { ok: true } | { ok: false; message: string };

/**
 * POST a form payload to Formspree and normalise every outcome — missing
 * endpoint, HTTP error, network failure — into one result shape, so a form
 * component only has to render `message`.
 */
export async function submitToFormspree(
  endpoint: string | undefined,
  payload: Record<string, unknown>,
  unconfiguredMessage = "This form isn't configured yet. Please try again later.",
): Promise<FormspreeResult> {
  if (!endpoint) return { ok: false, message: unconfiguredMessage };
  try {
    // `Accept: application/json` makes Formspree return JSON instead of
    // redirecting to its own thank-you page, so the user stays on this page.
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    const parsed = formspreeError.safeParse(await res.json().catch(() => null));
    return {
      ok: false,
      message:
        (parsed.success && parsed.data.errors?.[0]?.message) ||
        "Something went wrong. Please try again.",
    };
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}
