/**
 * Integration test for the tabbed config modal introduced in Phase 3.
 * Renders the Dashboard with a fake component that has both a config UI
 * and actions, opens the gear modal, and verifies that switching tabs +
 * saving from each side persists the right shape in localStorage.
 */

import type { ActionDefinition } from "@gonogo/core";
import { clearRegistry, registerComponent } from "@gonogo/core";
import { ModalProvider } from "@gonogo/ui";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  Dashboard,
  type DashboardConfig,
  type DashboardItem,
} from "../components/Dashboard";

const actions = [
  { id: "toggle", label: "Toggle", accepts: ["button"] },
] as const satisfies readonly ActionDefinition[];

function FakeConfig({
  config,
  onSave,
}: {
  config: { label?: string };
  onSave: (c: { label?: string }) => void;
}) {
  const [value, setValue] = useState(config.label ?? "");
  return (
    <div>
      <label htmlFor="fake-label">Label</label>
      <input
        id="fake-label"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="button" onClick={() => onSave({ label: value })}>
        save-config
      </button>
    </div>
  );
}

function FakeComponent({ config }: { config?: { label?: string } }) {
  return <div data-testid="fake-label">{config?.label ?? "-"}</div>;
}

function registerFakeWithConfigAndActions() {
  registerComponent({
    id: "fake-both",
    name: "Fake",
    description: "fake",
    tags: [],
    component: FakeComponent,
    configComponent: FakeConfig,
    actions,
    defaultConfig: { label: "" },
  });
}

const STORAGE_KEY = "gonogo.dashboard.test";

const CONFIG: DashboardConfig = {
  items: [{ i: "w1", componentId: "fake-both" } satisfies DashboardItem],
  layouts: { lg: [{ i: "w1", x: 0, y: 0, w: 3, h: 3 }] },
};

beforeEach(() => {
  clearRegistry();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Dashboard tabbed config modal", () => {
  it("opens tabs when a component has both a configComponent and actions", () => {
    registerFakeWithConfigAndActions();
    render(
      <ModalProvider>
        <Dashboard config={CONFIG} storageKey={STORAGE_KEY} />
      </ModalProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /configure fake/i }));

    expect(screen.getByRole("tab", { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /inputs/i })).toBeInTheDocument();
  });

  it("persists config from the Settings tab into localStorage", () => {
    registerFakeWithConfigAndActions();
    render(
      <ModalProvider>
        <Dashboard config={CONFIG} storageKey={STORAGE_KEY} />
      </ModalProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /configure fake/i }));
    // Settings tab is active by default when a configComponent exists.
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "ALPHA" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save-config/i }));

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(persisted.items[0].config).toEqual({ label: "ALPHA" });
  });

  it("persists inputMappings (empty) when saving from the Inputs tab", () => {
    registerFakeWithConfigAndActions();
    render(
      <ModalProvider>
        <Dashboard config={CONFIG} storageKey={STORAGE_KEY} />
      </ModalProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /configure fake/i }));
    fireEvent.click(screen.getByRole("tab", { name: /inputs/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    expect(persisted.items[0].inputMappings).toEqual({});
  });

  it("shows only the Settings UI when a component has no actions", () => {
    registerComponent({
      id: "fake-config-only",
      name: "Fake CfgOnly",
      description: "",
      tags: [],
      component: FakeComponent,
      configComponent: FakeConfig,
    });
    render(
      <ModalProvider>
        <Dashboard
          config={{
            items: [{ i: "w1", componentId: "fake-config-only" }],
            layouts: { lg: [{ i: "w1", x: 0, y: 0, w: 3, h: 3 }] },
          }}
          storageKey={STORAGE_KEY}
        />
      </ModalProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /configure fake cfgonly/i }),
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toBeInTheDocument();
  });

  it("shows only the Inputs UI when a component has actions but no configComponent", () => {
    registerComponent({
      id: "fake-actions-only",
      name: "Fake ActionsOnly",
      description: "",
      tags: [],
      component: FakeComponent,
      actions,
    });
    render(
      <ModalProvider>
        <Dashboard
          config={{
            items: [{ i: "w1", componentId: "fake-actions-only" }],
            layouts: { lg: [{ i: "w1", x: 0, y: 0, w: 3, h: 3 }] },
          }}
          storageKey={STORAGE_KEY}
        />
      </ModalProvider>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /configure fake actionsonly/i }),
    );

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText(/Toggle/)).toBeInTheDocument();
  });
});
