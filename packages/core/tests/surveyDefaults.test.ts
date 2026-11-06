import { describe, expect, it } from "vitest";
import { EditExtras } from "../src/schemas";
import { NOTE_MAX } from "../src/note";
import { surveyExtras, surveyFormDefaults } from "../src/surveyDefaults";

describe("surveyFormDefaults", () => {
  it("prefills from what the node records", () => {
    expect(
      surveyFormDefaults({
        dog: "yes",
        fountain: "bubbler",
        bottle: "yes",
        seasonal: "yes",
        note: "By the gate",
      }),
    ).toEqual({ audience: "both", dispenser: "both", seasonal: true, note: "By the gate" });
  });

  it("falls back to the description, then to nothing, for the note", () => {
    expect(surveyFormDefaults({ description: "Behind the café" }).note).toBe("Behind the café");
    expect(surveyFormDefaults({}).note).toBe("");
  });

  it("starts a bare node as a humans' bubbler, not seasonal", () => {
    expect(surveyFormDefaults({ amenity: "drinking_water" })).toEqual({
      audience: "humans",
      dispenser: "bubbler",
      seasonal: false,
      note: "",
    });
  });
});

describe("surveyExtras", () => {
  const form = {
    audience: "humans",
    dispenser: "bottle",
    seasonal: true,
    note: "  a   b ",
  } as const;

  it("sends audience, dispenser, seasonal and the normalized note for a working point", () => {
    expect(surveyExtras("confirm", form)).toEqual({
      ok: true,
      extras: { audience: "humans", dispenser: "bottle", seasonal: true, note: "a b" },
    });
  });

  it("never marks an out-of-order point seasonal", () => {
    const r = surveyExtras("out_of_order", form);
    expect(r.ok && r.extras?.seasonal).toBeFalsy();
  });

  it("sends only the note for a removal, and nothing without one", () => {
    expect(surveyExtras("removed", form)).toEqual({ ok: true, extras: { note: "a b" } });
    expect(surveyExtras("removed", { ...form, note: "  " })).toEqual({
      ok: true,
      extras: undefined,
    });
  });

  it("leaves out an empty note and an unset seasonal flag", () => {
    expect(surveyExtras("broken", { ...form, seasonal: false, note: "" })).toEqual({
      ok: true,
      extras: { audience: "humans", dispenser: "bottle" },
    });
  });

  it("refuses a note the server would reject, and accepts one at the limit", () => {
    const over = surveyExtras("confirm", { ...form, note: "x".repeat(NOTE_MAX + 1) });
    expect(over.ok).toBe(false);
    const at = surveyExtras("confirm", { ...form, note: "x".repeat(NOTE_MAX) });
    expect(at.ok).toBe(true);
  });

  it("always produces extras the server's schema accepts", () => {
    for (const kind of ["confirm", "broken", "out_of_order", "removed"] as const) {
      const r = surveyExtras(kind, surveyFormDefaults({ dog: "yes", note: "ok" }));
      expect(r.ok).toBe(true);
      if (r.ok && r.extras) expect(EditExtras.safeParse(r.extras).success).toBe(true);
    }
  });
});
