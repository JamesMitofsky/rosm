import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// lib/db resolves DATA_DIR at import time, so point it at a temp dir first and
// import fresh.
let db: typeof import("@/lib/db");
let dir: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "rfm-db-test-"));
  vi.stubEnv("DATA_DIR", dir);
  vi.resetModules();
  db = await import("@/lib/db");
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("readJson", () => {
  it("returns the fallback when the file does not exist", async () => {
    expect(await db.readJson("missing.json", { a: 1 })).toEqual({ a: 1 });
    expect(await db.readJson("missing.json", null)).toBeNull();
  });

  it("returns the fallback when the file holds invalid JSON", async () => {
    await fs.writeFile(path.join(dir, "corrupt.json"), "{not json", "utf8");
    expect(await db.readJson("corrupt.json", "fallback")).toBe("fallback");
  });
});

describe("writeJson / readJson", () => {
  it("round-trips a value", async () => {
    const value = { run: { stops: [1, 2, 3] }, when: "2026-07-04" };
    await db.writeJson("roundtrip.json", value);
    expect(await db.readJson("roundtrip.json", null)).toEqual(value);
  });

  it("creates the data dir on demand and pretty-prints", async () => {
    await db.writeJson("pretty.json", { a: 1 });
    const raw = await fs.readFile(path.join(dir, "pretty.json"), "utf8");
    expect(raw).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("overwrites an existing file", async () => {
    await db.writeJson("over.json", { v: 1 });
    await db.writeJson("over.json", { v: 2 });
    expect(await db.readJson("over.json", null)).toEqual({ v: 2 });
  });
});

describe("appendJson", () => {
  it("starts a new array file and appends in order", async () => {
    await db.appendJson("log.json", { id: 1 });
    await db.appendJson("log.json", { id: 2 });
    expect(await db.readJson("log.json", [])).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
