import { describe, expect, it } from "vitest";
import { detectMapsPlatform, walkingDirectionsUrl } from "../src/mapsDeepLink";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

describe("detectMapsPlatform", () => {
  it("sends iPhones to Apple Maps", () => {
    expect(detectMapsPlatform(IPHONE, 5)).toBe("apple");
  });

  it("recognises an iPad masquerading as a Mac by its touch points", () => {
    expect(detectMapsPlatform(IPAD_DESKTOP_MODE, 5)).toBe("apple");
    // A real Mac has none.
    expect(detectMapsPlatform(IPAD_DESKTOP_MODE, 0)).toBe("google");
  });

  it("sends everything else to Google Maps", () => {
    expect(detectMapsPlatform(MAC_CHROME)).toBe("google");
    expect(detectMapsPlatform(ANDROID, 5)).toBe("google");
    expect(detectMapsPlatform("")).toBe("google");
  });
});

describe("walkingDirectionsUrl", () => {
  const dest = { lat: 38.897204, lon: -77.036873 };

  it("builds an Apple Maps walking link", () => {
    expect(walkingDirectionsUrl("apple", dest)).toBe(
      "https://maps.apple.com/?daddr=38.897204,-77.036873&dirflg=w",
    );
  });

  it("builds a Google Maps walking link", () => {
    expect(walkingDirectionsUrl("google", dest)).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=38.897204,-77.036873&travelmode=walking",
    );
  });

  it("rounds coordinates to six decimals", () => {
    const url = walkingDirectionsUrl("google", { lat: 38.8972041234, lon: -77.0368731234 });
    expect(url).toContain("destination=38.897204,-77.036873");
  });
});
