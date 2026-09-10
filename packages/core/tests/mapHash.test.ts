import { describe, expect, it } from "vitest";
import { decodeMapHash, encodeMapHash } from "../src/mapHash";

const view = { zoom: 15.2, lat: 38.8972, lon: -77.0369 };
const fountain = { id: 123456, lat: 38.89801, lon: -77.03555 };

describe("encodeMapHash", () => {
  it("is empty when there is nothing to say", () => {
    expect(encodeMapHash({})).toBe("");
  });

  it("encodes the view alone", () => {
    expect(encodeMapHash({ view })).toBe("#v=15.20/38.89720/-77.03690");
  });

  it("encodes view and fountain", () => {
    expect(encodeMapHash({ view, fountain })).toBe(
      "#v=15.20/38.89720/-77.03690&f=123456/38.89801/-77.03555",
    );
  });

  it("rounds to 2 dp zoom and 5 dp coordinates", () => {
    const h = encodeMapHash({ view: { zoom: 15.123456, lat: 38.123456789, lon: -77.987654321 } });
    expect(h).toBe("#v=15.12/38.12346/-77.98765");
  });
});

describe("decodeMapHash", () => {
  it("round-trips", () => {
    const decoded = decodeMapHash(encodeMapHash({ view, fountain }));
    expect(decoded.view).toEqual({ zoom: 15.2, lat: 38.8972, lon: -77.0369 });
    expect(decoded.fountain).toEqual(fountain);
  });

  it("accepts a fragment with or without the leading #", () => {
    expect(decodeMapHash("v=15.20/38.89720/-77.03690").view).toEqual(view);
    expect(decodeMapHash("#v=15.20/38.89720/-77.03690").view).toEqual(view);
  });

  it("returns nothing for empty or garbage input", () => {
    expect(decodeMapHash("")).toEqual({});
    expect(decodeMapHash("#")).toEqual({});
    expect(decodeMapHash("#hello")).toEqual({});
    expect(decodeMapHash("#v=abc")).toEqual({});
    expect(decodeMapHash("#v=1/2")).toEqual({});
    expect(decodeMapHash("#v=1/2/3/4")).toEqual({});
    expect(decodeMapHash("#v=1//3")).toEqual({});
  });

  it("keeps the valid part when the other is broken", () => {
    const h = decodeMapHash("#v=15.20/38.89720/-77.03690&f=nope");
    expect(h.view).toEqual(view);
    expect(h.fountain).toBeUndefined();

    const g = decodeMapHash("#v=99/0/0&f=123456/38.89801/-77.03555");
    expect(g.view).toBeUndefined();
    expect(g.fountain).toEqual(fountain);
  });

  it("rejects out-of-range values", () => {
    expect(decodeMapHash("#v=15/91/0").view).toBeUndefined();
    expect(decodeMapHash("#v=15/0/181").view).toBeUndefined();
    expect(decodeMapHash("#v=-1/0/0").view).toBeUndefined();
    expect(decodeMapHash("#v=25/0/0").view).toBeUndefined();
    expect(decodeMapHash("#f=0/0/0").fountain).toBeUndefined();
    expect(decodeMapHash("#f=-5/0/0").fountain).toBeUndefined();
    expect(decodeMapHash("#f=1.5/0/0").fountain).toBeUndefined();
    expect(decodeMapHash("#f=1/0/0").fountain).toEqual({ id: 1, lat: 0, lon: 0 });
  });

  it("ignores unknown keys", () => {
    const h = decodeMapHash("#x=1&v=15.20/38.89720/-77.03690&y");
    expect(h.view).toEqual(view);
    expect(Object.keys(h)).toEqual(["view"]);
  });
});
