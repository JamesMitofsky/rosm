import { describe, expect, it } from "vitest";
import { editSummary, todayLocal } from "@/lib/editSummary";

const T = "2026-01-02";

describe("editSummary", () => {
  it("describes each action", () => {
    expect(editSummary("confirm", "amenity", T)).toBe(`confirmed · check_date=${T}`);
    expect(editSummary("out_of_order", "amenity", T)).toBe(
      `amenity → disused:amenity · check_date=${T}`,
    );
    expect(editSummary("removed", "amenity", T)).toBe(
      `amenity → abandoned:amenity · check_date=${T}`,
    );
  });

  it("appends audience tags only on confirm", () => {
    expect(editSummary("confirm", "amenity", T, { audience: "dogs" })).toBe(
      `confirmed · check_date=${T} · drinking_water=no · dog=yes`,
    );
    expect(editSummary("confirm", "amenity", T, { audience: "humans" })).toBe(
      `confirmed · check_date=${T} · dog=no`,
    );
    expect(editSummary("confirm", "amenity", T, { audience: "both" })).toBe(
      `confirmed · check_date=${T} · dog=yes`,
    );
    expect(editSummary("removed", "amenity", T, { audience: "dogs" })).not.toContain(
      "drinking_water",
    );
  });

  it("appends dispenser tags only on confirm", () => {
    expect(editSummary("confirm", "amenity", T, { dispenser: "bubbler" })).toBe(
      `confirmed · check_date=${T} · fountain=bubbler · bottle=no`,
    );
    expect(editSummary("confirm", "amenity", T, { dispenser: "bottle" })).toBe(
      `confirmed · check_date=${T} · fountain=bottle_refill`,
    );
    expect(editSummary("confirm", "amenity", T, { dispenser: "both" })).toBe(
      `confirmed · check_date=${T} · fountain=bubbler · bottle=yes`,
    );
    expect(editSummary("removed", "amenity", T, { dispenser: "both" })).not.toContain("bottle");
  });

  it("uses the primary tag key in lifecycle summaries", () => {
    expect(editSummary("out_of_order", "natural", T)).toBe(
      `natural → disused:natural · check_date=${T}`,
    );
  });

  it("appends seasonal only for confirm (mirrors applyAction gating)", () => {
    expect(editSummary("confirm", "amenity", T, { seasonal: true })).toContain("· seasonal=yes");
    expect(editSummary("out_of_order", "amenity", T, { seasonal: true })).not.toContain("seasonal");
    expect(editSummary("removed", "amenity", T, { seasonal: true })).not.toContain("seasonal");
  });

  it("notes when a public note was added", () => {
    expect(editSummary("confirm", "amenity", T, { note: "leaking" })).toBe(
      `confirmed · check_date=${T} · note added`,
    );
  });

  it("combines seasonal and note suffixes in order", () => {
    expect(editSummary("confirm", "amenity", T, { seasonal: true, note: "x" })).toBe(
      `confirmed · check_date=${T} · seasonal=yes · note added`,
    );
  });
});

describe("todayLocal", () => {
  it("returns an ISO date string for today", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayLocal()).toBe(new Date().toISOString().slice(0, 10));
  });
});
