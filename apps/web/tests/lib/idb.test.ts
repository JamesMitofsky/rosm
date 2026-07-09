import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { idbClearOutbox, idbDelete, idbGetAll, idbGetMeta, idbPut, idbSetMeta } from "@/lib/idb";

type Item = { id: string; nodeId: number };

beforeEach(async () => {
  await idbClearOutbox();
});

describe("outbox store", () => {
  it("starts empty", async () => {
    expect(await idbGetAll<Item>()).toEqual([]);
  });

  it("puts and reads items back", async () => {
    await idbPut<Item>({ id: "a", nodeId: 1 });
    await idbPut<Item>({ id: "b", nodeId: 2 });
    const all = await idbGetAll<Item>();
    expect(all.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("put with an existing id replaces the record", async () => {
    await idbPut<Item>({ id: "a", nodeId: 1 });
    await idbPut<Item>({ id: "a", nodeId: 99 });
    const all = await idbGetAll<Item>();
    expect(all).toEqual([{ id: "a", nodeId: 99 }]);
  });

  it("deletes a single record by id", async () => {
    await idbPut<Item>({ id: "a", nodeId: 1 });
    await idbPut<Item>({ id: "b", nodeId: 2 });
    await idbDelete("a");
    expect((await idbGetAll<Item>()).map((i) => i.id)).toEqual(["b"]);
  });

  it("clears the whole store", async () => {
    await idbPut<Item>({ id: "a", nodeId: 1 });
    await idbClearOutbox();
    expect(await idbGetAll<Item>()).toEqual([]);
  });
});

describe("meta store", () => {
  it("returns undefined for a missing key", async () => {
    expect(await idbGetMeta("nope")).toBeUndefined();
  });

  it("round-trips a value", async () => {
    await idbSetMeta("changesetId", 42);
    expect(await idbGetMeta<number>("changesetId")).toBe(42);
  });

  it("overwrites a key", async () => {
    await idbSetMeta("changesetId", 1);
    await idbSetMeta("changesetId", 2);
    expect(await idbGetMeta<number>("changesetId")).toBe(2);
  });
});

describe("without IndexedDB (SSR / private mode)", () => {
  it("degrades to safe no-ops", async () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(await idbGetAll()).toEqual([]);
    await expect(idbPut({ id: "x" })).resolves.toBeUndefined();
    await expect(idbDelete("x")).resolves.toBeUndefined();
    await expect(idbClearOutbox()).resolves.toBeUndefined();
    expect(await idbGetMeta("k")).toBeUndefined();
    await expect(idbSetMeta("k", 1)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
