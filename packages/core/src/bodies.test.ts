import { afterEach, describe, expect, it } from "vitest";
import { clearBodies, getAllBodies, getBody, registerBody } from "./bodies";
import { registerStockBodies } from "./stock-bodies";

afterEach(() => clearBodies());

describe("body registry", () => {
  it("returns undefined for an unregistered body", () => {
    expect(getBody("Kerbin")).toBeUndefined();
  });

  it("stores and retrieves a registered body by id", () => {
    registerBody({
      id: "Kerbin",
      name: "Kerbin",
      radius: 600_000,
      color: "#1A6B8A",
    });
    const body = getBody("Kerbin");
    expect(body?.name).toBe("Kerbin");
    expect(body?.radius).toBe(600_000);
  });

  it("getAllBodies returns all registered bodies", () => {
    registerBody({ id: "Kerbin", name: "Kerbin", radius: 600_000 });
    registerBody({ id: "Mun", name: "Mun", radius: 200_000, parent: "Kerbin" });
    const all = getAllBodies();
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.id)).toContain("Kerbin");
    expect(all.map((b) => b.id)).toContain("Mun");
  });

  it("allows overwriting a body by re-registering with the same id", () => {
    registerBody({ id: "Kerbin", name: "Kerbin", radius: 600_000 });
    registerBody({ id: "Kerbin", name: "Kerbin (modded)", radius: 650_000 });
    expect(getBody("Kerbin")?.radius).toBe(650_000);
    expect(getAllBodies()).toHaveLength(1);
  });

  it("clearBodies empties the registry", () => {
    registerBody({ id: "Kerbin", name: "Kerbin", radius: 600_000 });
    clearBodies();
    expect(getAllBodies()).toHaveLength(0);
  });
});

describe("registerStockBodies", () => {
  it("registers all 17 Kerbol system bodies", () => {
    registerStockBodies();
    expect(getAllBodies()).toHaveLength(17);
  });

  it("registers Kerbin with correct radius", () => {
    registerStockBodies();
    expect(getBody("Kerbin")?.radius).toBe(600_000);
  });

  it("registers Mun as a child of Kerbin", () => {
    registerStockBodies();
    expect(getBody("Mun")?.parent).toBe("Kerbin");
  });

  it("registers the star as Sun", () => {
    registerStockBodies();
    const star = getBody("Sun");
    expect(star?.name).toBe("Kerbol");
    expect(star?.radius).toBe(261_600_000);
  });

  it("all bodies with a parent reference a body that is also registered", () => {
    registerStockBodies();
    const all = getAllBodies();
    const ids = new Set(all.map((b) => b.id));
    for (const body of all) {
      if (body.parent) {
        expect(
          ids.has(body.parent),
          `${body.id}.parent "${body.parent}" not registered`,
        ).toBe(true);
      }
    }
  });
});
