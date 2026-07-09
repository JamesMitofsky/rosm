// Minimal IndexedDB wrapper for the offline outbox. IndexedDB (not localStorage)
// is the on-device store: it survives reloads, works offline, and holds the queue
// of OSM edits that still need to be sent. Two object stores:
//   - "outbox": one record per queued edit, keyed by its uuid.
//   - "meta":   small key/value rows (e.g. the open changeset id).
const DB_NAME = "run-for-maps";
const OUTBOX = "outbox";
const META = "meta";
const VERSION = 1;

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "id" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function idbGetAll<T>(): Promise<T[]> {
  if (!available()) return [];
  try {
    return await tx<T[]>(OUTBOX, "readonly", (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function idbPut<T>(item: T): Promise<void> {
  if (!available()) return;
  try {
    await tx(OUTBOX, "readwrite", (s) => s.put(item));
  } catch {
    /* best-effort persistence */
  }
}

export async function idbDelete(id: string): Promise<void> {
  if (!available()) return;
  try {
    await tx(OUTBOX, "readwrite", (s) => s.delete(id));
  } catch {
    /* best-effort */
  }
}

export async function idbClearOutbox(): Promise<void> {
  if (!available()) return;
  try {
    await tx(OUTBOX, "readwrite", (s) => s.clear());
  } catch {
    /* best-effort */
  }
}

export async function idbGetMeta<T>(key: string): Promise<T | undefined> {
  if (!available()) return undefined;
  try {
    const row = await tx<{ key: string; value: T } | undefined>(META, "readonly", (s) =>
      s.get(key),
    );
    return row?.value;
  } catch {
    return undefined;
  }
}

export async function idbSetMeta<T>(key: string, value: T): Promise<void> {
  if (!available()) return;
  try {
    await tx(META, "readwrite", (s) => s.put({ key, value }));
  } catch {
    /* best-effort */
  }
}
