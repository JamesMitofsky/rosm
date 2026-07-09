import { afterEach } from "vitest";

// Shared test setup (runs before every suite).
//
// Without vitest globals, Testing Library can't self-register its afterEach
// cleanup, so mounted hooks/components would leak (and re-fire effects) across
// tests. Register it explicitly for browser-flavored suites.
if (typeof window !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}

//
// Node 22+ exposes an experimental `localStorage` accessor on globalThis that
// returns undefined unless the process runs with --localstorage-file. Under the
// jsdom environment that accessor can shadow jsdom's real Storage, so browser
// suites would see `window.localStorage === undefined`. Replace it with a real
// in-memory Storage per test file.
if (typeof window !== "undefined" && !globalThis.localStorage) {
  class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length(): number {
      return this.map.size;
    }
    clear(): void {
      this.map.clear();
    }
    getItem(key: string): string | null {
      return this.map.has(key) ? (this.map.get(key) as string) : null;
    }
    key(index: number): string | null {
      return [...this.map.keys()][index] ?? null;
    }
    removeItem(key: string): void {
      this.map.delete(key);
    }
    setItem(key: string, value: string): void {
      this.map.set(key, String(value));
    }
  }
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}
