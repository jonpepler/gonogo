import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRegistry,
  getComponent,
  getComponents,
  getDataSources,
  getTheme,
  getThemes,
  registerComponent,
  registerDataSource,
  registerTheme,
} from "./registry";
import type { ComponentDefinition, DataSource, ThemeDefinition } from "./types";

const mockComponent: ComponentDefinition = {
  id: "test-component",
  name: "Test Component",
  category: "test",
  component: () => null,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: {},
};

const mockDataSource: DataSource = {
  id: "test-source",
  name: "Test Source",
  status: "disconnected",
  connect: async () => {},
  disconnect: () => {},
  schema: () => [],
  subscribe: () => () => {},
  onStatusChange: () => () => {},
};

const mockTheme: ThemeDefinition = {
  id: "test-theme",
  name: "Test Theme",
  theme: { colors: { primary: "#fff" } },
};

beforeEach(() => {
  clearRegistry();
});

describe("registerComponent / getComponent / getComponents", () => {
  it("retrieves a registered component by id", () => {
    registerComponent(mockComponent);
    expect(getComponent("test-component")).toBe(mockComponent);
  });

  it("returns undefined for an unregistered id", () => {
    expect(getComponent("nope")).toBeUndefined();
  });

  it("returns all registered components", () => {
    registerComponent(mockComponent);
    expect(getComponents()).toHaveLength(1);
    expect(getComponents()[0]).toBe(mockComponent);
  });

  it("overwrites a component registered with the same id", () => {
    registerComponent(mockComponent);
    const updated = { ...mockComponent, name: "Updated" };
    registerComponent(updated);
    expect(getComponent("test-component")?.name).toBe("Updated");
    expect(getComponents()).toHaveLength(1);
  });
});

describe("registerDataSource / getDataSources", () => {
  it("returns all registered data sources", () => {
    registerDataSource(mockDataSource);
    expect(getDataSources()).toHaveLength(1);
    expect(getDataSources()[0]).toBe(mockDataSource);
  });

  it("returns empty array when none are registered", () => {
    expect(getDataSources()).toHaveLength(0);
  });
});

describe("registerTheme / getTheme / getThemes", () => {
  it("retrieves a registered theme by id", () => {
    registerTheme(mockTheme);
    expect(getTheme("test-theme")).toBe(mockTheme);
  });

  it("returns undefined for an unregistered id", () => {
    expect(getTheme("nope")).toBeUndefined();
  });

  it("returns all registered themes", () => {
    registerTheme(mockTheme);
    expect(getThemes()).toHaveLength(1);
  });
});

describe("clearRegistry", () => {
  it("clears all registries", () => {
    registerComponent(mockComponent);
    registerDataSource(mockDataSource);
    registerTheme(mockTheme);

    clearRegistry();

    expect(getComponents()).toHaveLength(0);
    expect(getDataSources()).toHaveLength(0);
    expect(getThemes()).toHaveLength(0);
  });
});
