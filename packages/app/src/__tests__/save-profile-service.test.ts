import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveProfileService } from "../saveProfiles/SaveProfileService";

function makeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => Array.from(data.keys())[i] ?? null,
    removeItem: (k) => {
      data.delete(k);
    },
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe("SaveProfileService", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("seeds a default profile on first run", () => {
    const svc = new SaveProfileService(storage);
    expect(svc.getAll()).toHaveLength(1);
    expect(svc.getActive().name).toBe("Survey Profile 1");
  });

  it("persists profiles across instances", () => {
    const svc1 = new SaveProfileService(storage);
    svc1.create("Mission B");
    const svc2 = new SaveProfileService(storage);
    expect(
      svc2
        .getAll()
        .map((p) => p.name)
        .sort(),
    ).toEqual(["Mission B", "Survey Profile 1"]);
  });

  it("setActive updates active profile and notifies listeners", () => {
    const svc = new SaveProfileService(storage);
    const second = svc.create("Mission B");
    const spy = vi.fn();
    svc.onActiveChange(spy);
    svc.setActive(second.id);
    expect(svc.getActiveId()).toBe(second.id);
    expect(spy).toHaveBeenCalledWith(second.id);
  });

  it("remove auto-switches active when deleting the active profile", () => {
    const svc = new SaveProfileService(storage);
    const original = svc.getActiveId();
    const second = svc.create("Mission B");
    svc.remove(original);
    expect(svc.getActiveId()).toBe(second.id);
    expect(svc.getAll().map((p) => p.id)).toEqual([second.id]);
  });

  it("remove recreates a default profile when deleting the last one", () => {
    const svc = new SaveProfileService(storage);
    svc.remove(svc.getActiveId());
    expect(svc.getAll()).toHaveLength(1);
    expect(svc.getActive().name).toBe("Survey Profile 1");
  });

  it("rename updates the profile name", () => {
    const svc = new SaveProfileService(storage);
    const id = svc.getActiveId();
    svc.rename(id, "Apollo 11");
    expect(svc.get(id)?.name).toBe("Apollo 11");
  });

  it("recovers from a corrupted active id by picking an existing profile", () => {
    const svc1 = new SaveProfileService(storage);
    svc1.create("Mission B");
    const validIds = new Set(svc1.getAll().map((p) => p.id));
    // Simulate user/system tampering with the active key
    storage.setItem("gonogo.saveProfiles.active", "nonexistent");
    const svc2 = new SaveProfileService(storage);
    expect(validIds.has(svc2.getActiveId())).toBe(true);
  });
});
