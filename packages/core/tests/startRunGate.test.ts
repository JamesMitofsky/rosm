import { describe, expect, it } from "vitest";
import { startRunBlocker } from "../src/startRunGate";

const ready = { hasSelectedFountains: true, busy: null, routeStale: false, hasError: false };

describe("startRunBlocker", () => {
  it("lets a planned, current route start", () => {
    expect(startRunBlocker(ready)).toBe(null);
  });

  it("asks for a fountain when none is picked", () => {
    expect(startRunBlocker({ ...ready, hasSelectedFountains: false })).toBe(
      "Add a fountain to your route to start.",
    );
  });

  it("says a search is under way before asking for picks", () => {
    expect(startRunBlocker({ ...ready, hasSelectedFountains: false, busy: "find" })).toBe(
      "Finding fountains…",
    );
  });

  it("waits out a re-plan or a reversal", () => {
    expect(startRunBlocker({ ...ready, busy: "route" })).toBe("Updating your route…");
    expect(startRunBlocker({ ...ready, busy: "reverse" })).toBe("Reversing your route…");
    expect(startRunBlocker({ ...ready, routeStale: true })).toBe("Updating your route…");
  });

  it("points at the error when a stale route failed to re-plan", () => {
    expect(startRunBlocker({ ...ready, routeStale: true, hasError: true })).toBe(
      "Fix the route problem above to start.",
    );
  });

  it("blocks in exactly the cases the old gate did", () => {
    // The previous gate: !hasSelectedFountains || busy !== null || routeStale.
    for (const hasSelectedFountains of [true, false])
      for (const busy of [null, "find", "route", "reverse", "search"])
        for (const routeStale of [true, false])
          for (const hasError of [true, false]) {
            const old = !hasSelectedFountains || busy !== null || routeStale;
            const blocked =
              startRunBlocker({ hasSelectedFountains, busy, routeStale, hasError }) !== null;
            expect(blocked).toBe(old);
          }
  });
});
