/**
 * Regression: adding a widget whose ComponentDefinition has
 * `openConfigOnAdd: true` opens the config modal immediately. Previously
 * the modal's Save was discarded — the item stuck with `defaultConfig`
 * forever. This test covers the config-persists-on-initial-add path.
 */

import {
  type ComponentDefinition,
  clearRegistry,
  registerComponent,
} from "@gonogo/core";
import { SerialDeviceProvider, SerialDeviceService } from "@gonogo/serial";
import { ModalProvider } from "@gonogo/ui";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ComponentOverlay,
  OverlayProvider,
} from "../components/ComponentOverlay";

interface TrivialConfig {
  label?: string;
}

function TrivialWidget({ config }: { config?: TrivialConfig }) {
  return <div>trivial: {config?.label ?? "default"}</div>;
}

function TrivialConfigUI({
  config,
  onSave,
}: {
  config: TrivialConfig;
  onSave: (next: TrivialConfig) => void;
}) {
  return (
    <div>
      <input
        aria-label="label"
        defaultValue={config.label ?? ""}
        onChange={(e) => {
          // store draft on DOM attribute for the save button to pick up
          e.currentTarget.dataset.draft = e.currentTarget.value;
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          const input = (e.currentTarget.previousElementSibling ??
            null) as HTMLInputElement | null;
          onSave({ label: input?.value ?? "" });
        }}
      >
        Save
      </button>
    </div>
  );
}

function registerTrivial() {
  registerComponent({
    id: "trivial",
    name: "Trivial",
    description: "",
    tags: [],
    component: TrivialWidget,
    configComponent: TrivialConfigUI,
    openConfigOnAdd: true,
    dataRequirements: [],
    behaviors: [],
    defaultConfig: { label: "default" },
  } as unknown as ComponentDefinition);
}

describe("ComponentOverlay — add → configure → persist", () => {
  afterEach(() => {
    cleanup();
    clearRegistry();
  });

  it("persists the config entered in the on-add modal via updateItemConfig", async () => {
    // registerComponent before render — ComponentOverlay reads the registry
    // on every render via getComponents().
    registerTrivial();
    const addItem = vi.fn();
    const updateItemConfig = vi.fn();
    const serialService = new SerialDeviceService({ screenKey: "test" });

    render(
      <ModalProvider>
        <SerialDeviceProvider service={serialService}>
          <OverlayProvider
            addItem={addItem}
            updateItemConfig={updateItemConfig}
          >
            <ComponentOverlay currentLayouts={{ lg: [] }} />
          </OverlayProvider>
        </SerialDeviceProvider>
      </ModalProvider>,
    );

    // Open the component-add panel, pick Trivial. The list items are
    // <ListItem> buttons whose accessible name combines name + description.
    await act(async () => {
      screen.getByRole("button", { name: "Add component" }).click();
    });
    const trivialButton = await screen.findByRole("button", {
      name: /Trivial/,
    });
    await act(async () => {
      trivialButton.click();
    });

    // addItem fired with a fresh DashboardItem. Capture its id so we can
    // assert the updateItemConfig call routes to the same instance.
    expect(addItem).toHaveBeenCalledTimes(1);
    const newItem = addItem.mock.calls[0][0] as { i: string };

    // The config modal should have opened (openConfigOnAdd). Edit + save.
    const input = (await waitFor(() =>
      screen.getByLabelText("label"),
    )) as HTMLInputElement;
    input.value = "custom-name";
    await act(async () => {
      screen.getByRole("button", { name: "Save" }).click();
    });

    // This is the regression — without the fix, no call at all was made.
    expect(updateItemConfig).toHaveBeenCalledWith(newItem.i, {
      label: "custom-name",
    });
  });
});
