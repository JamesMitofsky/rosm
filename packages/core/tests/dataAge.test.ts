import { describe, expect, it } from "vitest";
import { dataAgeNotice } from "../src/dataAge";

const NOW = Date.parse("2026-11-03T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

describe("dataAgeNotice", () => {
  it("says nothing about data under six hours old", () => {
    expect(dataAgeNotice(hoursAgo(0), NOW)).toBeNull();
    expect(dataAgeNotice(hoursAgo(1.5), NOW)).toBeNull();
    expect(dataAgeNotice(hoursAgo(5.99), NOW)).toBeNull();
  });

  it("names the age in whole hours from six hours on", () => {
    expect(dataAgeNotice(hoursAgo(6), NOW)).toBe(
      "Showing data from 6 hours ago. The underlying data is slow to update right now.",
    );
    expect(dataAgeNotice(hoursAgo(9.9), NOW)).toContain("from 9 hours ago");
    expect(dataAgeNotice(hoursAgo(47.9), NOW)).toContain("from 47 hours ago");
  });

  it("switches to days at two days", () => {
    expect(dataAgeNotice(hoursAgo(48), NOW)).toContain("from 2 days ago");
    expect(dataAgeNotice(hoursAgo(24 * 6.5), NOW)).toContain("from 6 days ago");
  });

  it("says nothing without a usable time", () => {
    for (const asOf of [undefined, null, "", "not a date", 12345]) {
      expect(dataAgeNotice(asOf, NOW)).toBeNull();
    }
  });

  it("never names the data service", () => {
    expect(dataAgeNotice(hoursAgo(30), NOW)).not.toMatch(/openstreetmap|osm|overpass/i);
  });
});
