// Shared Tailwind classes for the site's plain (non-map) forms — waitlist and
// feedback. One copy so a control on one form can't drift from the same control
// on another; anything genuinely page-specific stays inline at the call site.
// Tailwind v4 auto-detects sources, so class names written here still generate.

/** Text input / textarea / select shell. */
export const FIELD_CLASS =
  "bg-surface text-base border-base/15 placeholder:text-muted focus:border-link focus:ring-link/30 rounded-sm border px-4 py-2.5 text-base transition outline-none focus:ring-2";

/** Full-width primary submit button. */
export const SUBMIT_CLASS =
  "mt-2 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-blue px-6 py-3 text-lg font-bold text-white transition hover:bg-[#0a6fa3] disabled:opacity-60";

/** Label text above a field. */
export const LABEL_CLASS = "text-base text-sm font-medium";
