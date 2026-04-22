import { beforeEach, describe, expect, it, vi } from "vitest";
import { StationIdentityService } from "../stationIdentity/StationIdentityService";

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

describe("StationIdentityService", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("seeds a generated name on first run for a profile", () => {
    const svc = new StationIdentityService("profile-A", storage);
    expect(svc.getName()).toMatch(/^Station [A-Z0-9]{4}$/);
    expect(storage.getItem("gonogo.station.name.profile-A")).toBe(svc.getName());
  });

  it("preserves a saved name across instances for the same profile", () => {
    storage.setItem("gonogo.station.name.profile-A", "Capsule Komm");
    const svc = new StationIdentityService("profile-A", storage);
    expect(svc.getName()).toBe("Capsule Komm");
  });

  it("isolates names between profiles", () => {
    storage.setItem("gonogo.station.name.profile-A", "Alpha");
    storage.setItem("gonogo.station.name.profile-B", "Bravo");
    expect(new StationIdentityService("profile-A", storage).getName()).toBe(
      "Alpha",
    );
    expect(new StationIdentityService("profile-B", storage).getName()).toBe(
      "Bravo",
    );
  });

  it("migrates a legacy unscoped name into the first profile that asks for one", () => {
    storage.setItem("gonogo.station.name", "Old Name");
    const svc = new StationIdentityService("profile-A", storage);
    expect(svc.getName()).toBe("Old Name");
    expect(storage.getItem("gonogo.station.name.profile-A")).toBe("Old Name");
    expect(storage.getItem("gonogo.station.name")).toBeNull();
    // A second profile doesn't inherit the migrated name — it gets its own.
    const svc2 = new StationIdentityService("profile-B", storage);
    expect(svc2.getName()).not.toBe("Old Name");
  });

  it("setName persists, trims, and notifies listeners", () => {
    const svc = new StationIdentityService("profile-A", storage);
    const spy = vi.fn();
    svc.onChange(spy);
    svc.setName("  CAPCOM  ");
    expect(svc.getName()).toBe("CAPCOM");
    expect(storage.getItem("gonogo.station.name.profile-A")).toBe("CAPCOM");
    expect(spy).toHaveBeenCalledWith("CAPCOM");
  });

  it("ignores empty or unchanged names", () => {
    const svc = new StationIdentityService("profile-A", storage);
    const original = svc.getName();
    const spy = vi.fn();
    svc.onChange(spy);
    svc.setName("");
    svc.setName("   ");
    svc.setName(original);
    expect(svc.getName()).toBe(original);
    expect(spy).not.toHaveBeenCalled();
  });
});
