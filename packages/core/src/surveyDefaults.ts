import type { Audience, Dispenser, EditExtras } from "./schemas";
import { audienceFromTags } from "./audience";
import { dispenserFromTags } from "./dispenser";
import { NOTE_MAX, normalizeNote } from "./note";

// The survey details form's fields, and what submitting them sends. Shared by
// the form itself and by the one-tap "Working" answer, which records exactly
// what the form would have sent had it been submitted untouched.

export type SurveyKind = "confirm" | "broken" | "out_of_order" | "removed";

export type SurveyForm = {
  audience: Audience;
  dispenser: Dispenser;
  seasonal: boolean;
  note: string;
};

// The form's starting values: what the node already records.
export function surveyFormDefaults(tags: Record<string, string>): SurveyForm {
  return {
    audience: audienceFromTags(tags),
    dispenser: dispenserFromTags(tags),
    seasonal: tags.seasonal === "yes",
    note: tags.note ?? tags.description ?? "",
  };
}

export type SurveyExtrasResult =
  { ok: true; extras: EditExtras | undefined } | { ok: false; error: string };

// What a submit of `form` sends for `kind`. Refuses a note over NOTE_MAX rather
// than queue an edit the server would reject for good: only the user can
// shorten it. A removal carries just the note; an out-of-order point is never
// marked seasonal.
export function surveyExtras(kind: SurveyKind, form: SurveyForm): SurveyExtrasResult {
  const note = normalizeNote(form.note);
  if (note.length > NOTE_MAX) {
    return {
      ok: false,
      error: `Shorten the note to ${NOTE_MAX} characters (it has ${note.length}).`,
    };
  }
  if (kind === "removed") return { ok: true, extras: note ? { note } : undefined };
  const extras: EditExtras = { audience: form.audience, dispenser: form.dispenser };
  if (form.seasonal && kind !== "out_of_order") extras.seasonal = true;
  if (note) extras.note = note;
  return { ok: true, extras };
}
