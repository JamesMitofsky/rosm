import { describe, expect, it } from "vitest";
import { CHECK_DATE_KEYS, lastCheckedMs, matchesRecency, parseCheckDate } from "@/lib/checkDate";

describe("parseCheckDate", () => {
  it("parses a full YYYY-MM-DD date", () => {
    expect(parseCheckDate("2024-03-15")).toBe(Date.UTC(2024, 2, 15));
  });

  it("resolves partial dates to their earliest instant", () => {
    expect(parseCheckDate("2024")).toBe(Date.UTC(2024, 0, 1));
    expect(parseCheckDate("2024-03")).toBe(Date.UTC(2024, 2, 1));
  });

  it("tolerates surrounding whitespace and trailing text", () => {
    expect(parseCheckDate(" 2024-03-15 ")).toBe(Date.UTC(2024, 2, 15));
    expect(parseCheckDate("2024-03-15;fixme")).toBe(Date.UTC(2024, 2, 15));
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseCheckDate(undefined)).toBeNull();
    expect(parseCheckDate("")).toBeNull();
    expect(parseCheckDate("yes")).toBeNull();
    expect(parseCheckDate("15/03/2024")).toBeNull();
  });
});

describe("lastCheckedMs", () => {
  it("returns null when no survey tag is present", () => {
    expect(lastCheckedMs({})).toBeNull();
    expect(lastCheckedMs({ amenity: "drinking_water" })).toBeNull();
  });

  it("reads each supported survey key", () => {
    for (const key of CHECK_DATE_KEYS) {
      expect(lastCheckedMs({ [key]: "2023-06-01" })).toBe(Date.UTC(2023, 5, 1));
    }
  });

  it("prefers check_date over the other keys", () => {
    const ms = lastCheckedMs({
      "survey:date": "2020-01-01",
      check_date: "2024-01-01",
    });
    expect(ms).toBe(Date.UTC(2024, 0, 1));
  });

  it("returns null when the tag value is garbage", () => {
    expect(lastCheckedMs({ check_date: "unknown" })).toBeNull();
  });
});

describe("matchesRecency", () => {
  const cutoff = Date.UTC(2026, 0, 1);

  it('"any" keeps everything', () => {
    expect(matchesRecency({}, "any", cutoff)).toBe(true);
    expect(matchesRecency({ check_date: "1990-01-01" }, "any", cutoff)).toBe(true);
  });

  it('"stale" keeps never-surveyed points', () => {
    expect(matchesRecency({}, "stale", cutoff)).toBe(true);
  });

  it('"stale" keeps points surveyed before the cutoff, drops recent ones', () => {
    expect(matchesRecency({ check_date: "2025-12-31" }, "stale", cutoff)).toBe(true);
    expect(matchesRecency({ check_date: "2026-01-01" }, "stale", cutoff)).toBe(false);
    expect(matchesRecency({ check_date: "2026-06-15" }, "stale", cutoff)).toBe(false);
  });

  it('"fresh" keeps only points surveyed on/after the cutoff', () => {
    expect(matchesRecency({}, "fresh", cutoff)).toBe(false);
    expect(matchesRecency({ check_date: "2025-12-31" }, "fresh", cutoff)).toBe(false);
    expect(matchesRecency({ check_date: "2026-01-01" }, "fresh", cutoff)).toBe(true);
  });
});
