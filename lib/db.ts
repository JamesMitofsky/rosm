// Tiny JSON-file pseudo-DB. Per project convention: persist to local JSON, not localStorage.
import { promises as fs } from "fs";
import os from "os";
import path from "path";

// On serverless (Vercel), the deploy bundle dir (process.cwd() = /var/task) is
// read-only; only the OS temp dir is writable. Allow an explicit override too.
const DATA_DIR =
  process.env.DATA_DIR ??
  (process.env.VERCEL ? path.join(os.tmpdir(), "data") : path.join(process.cwd(), "data"));

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
