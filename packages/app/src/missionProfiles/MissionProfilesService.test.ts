import type { Layouts } from "react-grid-layout";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardItem } from "../components/Dashboard";
import { MissionProfilesService } from "./MissionProfilesService";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    length: 0,
    clear: () => map.clear(),
    key: () => null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  } as Storage;
}

const ITEMS: DashboardItem[] = [
  { i: "a", componentId: "fuel-status" },
  { i: "b", componentId: "map-view" },
];

const LAYOUTS: Layouts = {
  lg: [
    { i: "a", x: 0, y: 0, w: 8, h: 14, moved: false, static: false },
    { i: "b", x: 8, y: 0, w: 18, h: 14, moved: false, static: false },
  ],
};

describe("MissionProfilesService", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("starts empty for a fresh screen", () => {
    const svc = new MissionProfilesService("main", storage);
    expect(svc.list()).toEqual([]);
  });

  it("saves and lists a named snapshot", () => {
    const svc = new MissionProfilesService("main", storage);
    svc.save("Launch", ITEMS, LAYOUTS);
    const list = svc.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Launch");
    expect(list[0].items).toEqual(ITEMS);
    expect(list[0].layouts).toEqual(LAYOUTS);
    expect(list[0].screen).toBe("main");
  });

  it("partitions profiles by screen", () => {
    const main = new MissionProfilesService("main", storage);
    const station = new MissionProfilesService("station", storage);
    main.save("Launch", ITEMS, LAYOUTS);
    station.save("Probe", ITEMS, LAYOUTS);
    expect(main.list().map((p) => p.name)).toEqual(["Launch"]);
    expect(station.list().map((p) => p.name)).toEqual(["Probe"]);
  });

  it("persists across service instances", () => {
    const a = new MissionProfilesService("main", storage);
    a.save("Launch", ITEMS, LAYOUTS);
    const b = new MissionProfilesService("main", storage);
    expect(b.list().map((p) => p.name)).toEqual(["Launch"]);
  });

  it("updates name, items, layouts via update()", () => {
    const svc = new MissionProfilesService("main", storage);
    const p = svc.save("Launch", ITEMS, LAYOUTS);
    svc.update(p.id, { name: "Ascent" });
    const [next] = svc.list();
    expect(next.name).toBe("Ascent");
    expect(next.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
  });

  it("removes a profile", () => {
    const svc = new MissionProfilesService("main", storage);
    const p = svc.save("Launch", ITEMS, LAYOUTS);
    svc.save("Orbit", ITEMS, LAYOUTS);
    svc.remove(p.id);
    expect(svc.list().map((x) => x.name)).toEqual(["Orbit"]);
  });

  it("notifies subscribers on mutation", () => {
    const svc = new MissionProfilesService("main", storage);
    const cb = vi.fn();
    const unsub = svc.subscribe(cb);
    svc.save("Launch", ITEMS, LAYOUTS);
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    svc.save("Orbit", ITEMS, LAYOUTS);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("falls back to an empty list when localStorage is corrupt", () => {
    storage.setItem("gonogo.missionProfiles.main", "{not json");
    const svc = new MissionProfilesService("main", storage);
    expect(svc.list()).toEqual([]);
    // Still writable afterwards.
    svc.save("Launch", ITEMS, LAYOUTS);
    expect(svc.list()).toHaveLength(1);
  });
});
