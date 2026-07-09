// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHeading } from "@/lib/useHeading";

// jsdom has no DeviceOrientationEvent; install a controllable stand-in per test.
function installOrientation(requestPermission?: () => Promise<"granted" | "denied">) {
  class FakeDeviceOrientationEvent extends Event {}
  if (requestPermission) {
    (FakeDeviceOrientationEvent as unknown as { requestPermission: unknown }).requestPermission =
      requestPermission;
  }
  vi.stubGlobal("DeviceOrientationEvent", FakeDeviceOrientationEvent);
}

function fireOrientation(props: {
  alpha?: number;
  absolute?: boolean;
  webkitCompassHeading?: number;
}) {
  act(() => {
    window.dispatchEvent(Object.assign(new Event("deviceorientation"), props));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHeading — no compass support", () => {
  it("falls back to the GPS travel heading", () => {
    const { result } = renderHook(({ gps }) => useHeading(gps), {
      initialProps: { gps: 123 as number | null },
    });
    expect(result.current.heading).toBe(123);
    expect(result.current.needsCompassPermission).toBe(false);
  });

  it("returns null when neither source exists", () => {
    const { result } = renderHook(() => useHeading(null));
    expect(result.current.heading).toBeNull();
  });
});

describe("useHeading — sensor available without a permission gate", () => {
  it("reads iOS-style webkitCompassHeading directly", () => {
    installOrientation();
    const { result } = renderHook(() => useHeading(null));
    fireOrientation({ webkitCompassHeading: 42 });
    expect(result.current.heading).toBe(42);
  });

  it("inverts android-style absolute alpha into a clockwise heading", () => {
    installOrientation();
    const { result } = renderHook(() => useHeading(null));
    fireOrientation({ alpha: 90, absolute: true });
    expect(result.current.heading).toBe(270);
  });

  it("ignores non-absolute alpha readings", () => {
    installOrientation();
    const { result } = renderHook(() => useHeading(77));
    fireOrientation({ alpha: 90, absolute: false });
    expect(result.current.heading).toBe(77); // still the GPS fallback
  });

  it("prefers the compass over the GPS heading once a fix arrives", () => {
    installOrientation();
    const { result } = renderHook(() => useHeading(10));
    expect(result.current.heading).toBe(10);
    fireOrientation({ webkitCompassHeading: 200 });
    expect(result.current.heading).toBe(200);
  });

  it("stops listening after unmount", () => {
    installOrientation();
    const { result, unmount } = renderHook(() => useHeading(null));
    fireOrientation({ webkitCompassHeading: 42 });
    expect(result.current.heading).toBe(42);
    unmount();
    // No state updates after teardown — dispatching again must not throw/warn.
    fireOrientation({ webkitCompassHeading: 90 });
  });
});

describe("useHeading — iOS 13+ permission gate", () => {
  it("asks for a user-gesture permission before listening", async () => {
    const request = vi.fn(async () => "granted" as const);
    installOrientation(request);

    const { result } = renderHook(() => useHeading(null));
    expect(result.current.needsCompassPermission).toBe(true);

    // Not listening yet: events are ignored until permission is granted.
    fireOrientation({ webkitCompassHeading: 42 });
    expect(result.current.heading).toBeNull();

    await act(async () => {
      await result.current.requestCompass();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.needsCompassPermission).toBe(false);

    fireOrientation({ webkitCompassHeading: 42 });
    expect(result.current.heading).toBe(42);
  });

  it("keeps the GPS fallback when permission is denied", async () => {
    installOrientation(vi.fn(async () => "denied" as const));

    const { result } = renderHook(() => useHeading(55));
    await act(async () => {
      await result.current.requestCompass();
    });

    fireOrientation({ webkitCompassHeading: 42 });
    expect(result.current.heading).toBe(55);
    expect(result.current.needsCompassPermission).toBe(false);
  });

  it("survives a permission prompt that throws", async () => {
    installOrientation(
      vi.fn(async () => {
        throw new Error("not allowed");
      }),
    );

    const { result } = renderHook(() => useHeading(55));
    await act(async () => {
      await result.current.requestCompass();
    });
    expect(result.current.heading).toBe(55);
  });
});
