import Storage from "expo-sqlite/kv-store";
import type { KvPort, OutboxStoragePort } from "@rosm/core/ports";
import type { OutboxItem } from "@rosm/core/stores/outbox";

// expo-sqlite/kv-store is a localStorage-/AsyncStorage-compatible key/value store
// backed by SQLite. Its synchronous getItemSync/setItemSync back the KvPort (route
// archive + planner draft), and its async API backs the outbox.

export const kv: KvPort = {
  get: (key) => Storage.getItemSync(key),
  set: (key, value) => Storage.setItemSync(key, value),
};

// One row per queued edit (keyed by id) + one row per meta value, mirroring the
// web IndexedDB layout so per-item puts stay atomic (no read-modify-write races).
const ITEM_PREFIX = "rosm:outbox:item:";
const META_PREFIX = "rosm:outbox:meta:";

export const outboxStorage: OutboxStoragePort = {
  getAll: async () => {
    const keys = (await Storage.getAllKeys()).filter((k) => k.startsWith(ITEM_PREFIX));
    if (keys.length === 0) return [];
    const rows = await Storage.multiGet(keys);
    return rows
      .map(([, v]) => (v ? (JSON.parse(v) as OutboxItem) : null))
      .filter((i): i is OutboxItem => i !== null);
  },
  put: async (item) => {
    await Storage.setItem(ITEM_PREFIX + item.id, JSON.stringify(item));
  },
  delete: async (id) => {
    await Storage.removeItem(ITEM_PREFIX + id);
  },
  clear: async () => {
    const keys = (await Storage.getAllKeys()).filter((k) => k.startsWith(ITEM_PREFIX));
    if (keys.length) await Storage.multiRemove(keys);
  },
  getMeta: async (key) => {
    const raw = await Storage.getItem(META_PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  },
  setMeta: async (key, value) => {
    if (value === undefined) await Storage.removeItem(META_PREFIX + key);
    else await Storage.setItem(META_PREFIX + key, JSON.stringify(value));
  },
};
