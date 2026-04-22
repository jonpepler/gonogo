import {
  type ComponentDefinition,
  clearRegistry,
  registerComponent,
} from "@gonogo/core";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PushedDashboardOverlay } from "../pushToMain/PushedDashboardOverlay";
import { PushHostProvider } from "../pushToMain/PushHostContext";
import type {
  PushedWidget,
  PushHostService,
} from "../pushToMain/PushHostService";

function MiniWidget({
  config,
}: {
  id?: string;
  config?: { label?: string };
  w?: number;
  h?: number;
}) {
  return <div>mini widget: {config?.label ?? "no-label"}</div>;
}

function registerMini() {
  registerComponent({
    id: "mini",
    name: "Mini",
    description: "Test widget",
    tags: [],
    component: MiniWidget,
    dataRequirements: [],
    behaviors: [],
    defaultConfig: {},
  } as unknown as ComponentDefinition);
}

function makeFakeHost(initial: PushedWidget[]): PushHostService {
  const widgets = [...initial];
  const listeners = new Set<(w: PushedWidget[]) => void>();
  const dismiss = vi.fn((peerId: string, widgetInstanceId: string) => {
    const before = widgets.length;
    const idx = widgets.findIndex(
      (w) => w.peerId === peerId && w.widgetInstanceId === widgetInstanceId,
    );
    if (idx !== -1) widgets.splice(idx, 1);
    if (widgets.length !== before) {
      for (const cb of listeners) cb([...widgets]);
    }
  });
  return {
    snapshot: () => [...widgets],
    onChange: (cb: (w: PushedWidget[]) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dismiss,
  } as unknown as PushHostService;
}

describe("PushedDashboardOverlay", () => {
  afterEach(() => {
    cleanup();
    clearRegistry();
  });

  it("renders nothing when the pushed list is empty", () => {
    const host = makeFakeHost([]);
    const { container } = render(
      <PushHostProvider service={host}>
        <PushedDashboardOverlay />
      </PushHostProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("mounts the registered component for each pushed widget", () => {
    registerMini();
    const host = makeFakeHost([
      {
        peerId: "peer-A",
        widgetInstanceId: "w1",
        componentId: "mini",
        config: { label: "Alpha" },
        width: 4,
        height: 3,
        stationName: "LDO",
      },
      {
        peerId: "peer-B",
        widgetInstanceId: "w2",
        componentId: "mini",
        config: { label: "Bravo" },
        width: 3,
        height: 3,
        stationName: "FIDO",
      },
    ]);
    render(
      <PushHostProvider service={host}>
        <PushedDashboardOverlay />
      </PushHostProvider>,
    );
    expect(screen.getByText("mini widget: Alpha")).toBeInTheDocument();
    expect(screen.getByText("mini widget: Bravo")).toBeInTheDocument();
    expect(screen.getByText("LDO")).toBeInTheDocument();
    expect(screen.getByText("FIDO")).toBeInTheDocument();
    expect(screen.getByText(/2 widgets/)).toBeInTheDocument();
  });

  it("dismiss button calls host.dismiss with the right key", async () => {
    registerMini();
    const widgets: PushedWidget[] = [
      {
        peerId: "peer-A",
        widgetInstanceId: "w1",
        componentId: "mini",
        config: {},
        width: 4,
        height: 3,
        stationName: "LDO",
      },
    ];
    const host = makeFakeHost(widgets);
    render(
      <PushHostProvider service={host}>
        <PushedDashboardOverlay />
      </PushHostProvider>,
    );
    screen.getByRole("button", { name: "Dismiss pushed widget" }).click();
    await waitFor(() => {
      expect(
        screen.queryByText("mini widget: no-label"),
      ).not.toBeInTheDocument();
    });
    expect(host.dismiss).toHaveBeenCalledWith("peer-A", "w1");
  });

  it("shows a fallback when the pushed componentId isn't registered on main", () => {
    const host = makeFakeHost([
      {
        peerId: "peer-A",
        widgetInstanceId: "w1",
        componentId: "missing-component",
        config: {},
        width: 4,
        height: 3,
        stationName: "LDO",
      },
    ]);
    render(
      <PushHostProvider service={host}>
        <PushedDashboardOverlay />
      </PushHostProvider>,
    );
    expect(
      screen.getByText(/missing-component.*not registered/),
    ).toBeInTheDocument();
  });
});
