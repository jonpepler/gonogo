import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { FogMaskStore } from "./FogMaskStore";

function freshStore(): FogMaskStore {
  // Unique DB name per test so state never leaks between cases
  return new FogMaskStore({ dbName: `gonogo-fog-test-${Math.random()}` });
}

describe("FogMaskStore", () => {
  let store: FogMaskStore;

  beforeEach(() => {
    store = freshStore();
  });

  it("returns null for an un-saved mask", async () => {
    const result = await store.load("profile-1", "Kerbin");
    expect(result).toBeNull();
  });

  it("round-trips a mask", async () => {
    const data = new Uint8Array([10, 20, 30, 40]);
    await store.save("profile-1", "Kerbin", data, 2, 2);
    const loaded = await store.load("profile-1", "Kerbin");
    expect(loaded).not.toBeNull();
    expect(loaded?.width).toBe(2);
    expect(loaded?.height).toBe(2);
    expect(Array.from(loaded?.data ?? [])).toEqual([10, 20, 30, 40]);
  });

  it("overwrites on re-save", async () => {
    await store.save("p", "Kerbin", new Uint8Array([1]), 1, 1);
    await store.save("p", "Kerbin", new Uint8Array([2]), 1, 1);
    const loaded = await store.load("p", "Kerbin");
    expect(Array.from(loaded?.data ?? [])).toEqual([2]);
  });

  it("isolates different profiles and bodies", async () => {
    await store.save("p1", "Kerbin", new Uint8Array([1]), 1, 1);
    await store.save("p2", "Kerbin", new Uint8Array([2]), 1, 1);
    await store.save("p1", "Mun", new Uint8Array([3]), 1, 1);
    expect((await store.load("p1", "Kerbin"))?.data[0]).toBe(1);
    expect((await store.load("p2", "Kerbin"))?.data[0]).toBe(2);
    expect((await store.load("p1", "Mun"))?.data[0]).toBe(3);
  });

  it("clear removes only the specified profile+body", async () => {
    await store.save("p", "Kerbin", new Uint8Array([1]), 1, 1);
    await store.save("p", "Mun", new Uint8Array([2]), 1, 1);
    await store.clear("p", "Kerbin");
    expect(await store.load("p", "Kerbin")).toBeNull();
    expect(await store.load("p", "Mun")).not.toBeNull();
  });

  it("clearProfile removes every body for a profile", async () => {
    await store.save("p1", "Kerbin", new Uint8Array([1]), 1, 1);
    await store.save("p1", "Mun", new Uint8Array([2]), 1, 1);
    await store.save("p2", "Kerbin", new Uint8Array([3]), 1, 1);
    await store.clearProfile("p1");
    expect(await store.load("p1", "Kerbin")).toBeNull();
    expect(await store.load("p1", "Mun")).toBeNull();
    expect(await store.load("p2", "Kerbin")).not.toBeNull();
  });
});
