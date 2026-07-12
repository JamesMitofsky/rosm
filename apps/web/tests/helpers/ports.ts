import { vi } from "vitest";
import { configureCore } from "@rosm/core/configure";
import type { OutboxItem } from "@rosm/core/stores/outbox";

// In-memory @rosm/core ports for web tests. Storage is real (in-memory) so store
// actions round-trip; the api port routes to whatever apiFetch mock the test
// passes, so both the run hook's direct calls and the outbox's port calls share
// one spy.
function memoryKv() {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
}

function memoryOutboxStorage() {
  const holder: { items: OutboxItem[]; meta: Map<string, unknown> } = {
    items: [],
    meta: new Map(),
  };
  return {
    getAll: async () => holder.items,
    put: async (item: OutboxItem) => {
      holder.items = [...holder.items.filter((i) => i.id !== item.id), item];
    },
    delete: async (id: string) => {
      holder.items = holder.items.filter((i) => i.id !== id);
    },
    clear: async () => {
      holder.items = [];
    },
    getMeta: async (key: string) => holder.meta.get(key),
    setMeta: async (key: string, value: unknown) => void holder.meta.set(key, value),
  };
}

export function configureTestPorts(apiFetch = vi.fn()) {
  configureCore({
    api: { apiFetch },
    kv: memoryKv(),
    outboxStorage: memoryOutboxStorage() as unknown as Parameters<
      typeof configureCore
    >[0]["outboxStorage"],
    geolocation: { getCurrentPosition: vi.fn() },
  });
  return { apiFetch };
}
