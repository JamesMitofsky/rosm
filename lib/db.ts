// Tiny JSON-file pseudo-DB. Per project convention: persist to local JSON, not localStorage.
import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(name: string, data: T): Promise<void> {
  await ensureDir();
  await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(data, null, 2), "utf8");
}

// Append an item to a JSON array file.
export async function appendJson<T>(name: string, item: T): Promise<void> {
  const arr = await readJson<T[]>(name, []);
  arr.push(item);
  await writeJson(name, arr);
}
