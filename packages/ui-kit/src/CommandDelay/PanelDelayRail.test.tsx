import { act, render, screen } from "@ksp-gonogo/test-utils";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import {
  type CommandHandle,
  createDelayRailStore,
  DelayRailContext,
} from "./DelayRailContext";
import { PanelDelayRail } from "./PanelDelayRail";
import { PanelRailTargetContext } from "./PanelRailTarget";
import type { InFlightCommandLike } from "./toInFlightListItems";

const IN_FLIGHT: InFlightCommandLike[] = [
  {
    id: "a",
    label: "Launch",
    command: "ksp.launch",
    reachEtaSeconds: 5,
    replyEtaSeconds: 9,
    predictedPhase: "in-transit",
  },
];

function handle(id: string): CommandHandle {
  return {
    id,
    inFlight: IN_FLIGHT,
    shape: "discrete",
    effectiveDelaySeconds: 5,
  };
}

// A drivable ResizeObserver so a test can supply the rail's measured height:
// jsdom has no layout, and the package setup installs a no-op stub. This
// stands in for it, capturing the callback so `drive()` can fire it with a
// chosen contentRect.
interface ROEntry {
  target: Element;
  contentRect: { width: number; height: number };
}
class DrivableResizeObserver {
  static instances: DrivableResizeObserver[] = [];
  readonly observed = new Set<Element>();
  readonly callback: (entries: ROEntry[]) => void;
  constructor(callback: (entries: ROEntry[]) => void) {
    this.callback = callback;
    DrivableResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.add(el);
  }
  unobserve(el: Element) {
    this.observed.delete(el);
  }
  disconnect() {
    this.observed.clear();
  }
}

function drive(el: Element, height: number) {
  act(() => {
    for (const ro of DrivableResizeObserver.instances) {
      if (ro.observed.has(el)) {
        ro.callback([{ target: el, contentRect: { width: 300, height } }]);
      }
    }
  });
}

const realResizeObserver = globalThis.ResizeObserver;

/** A target element (provided via `PanelRailTargetContext`, exactly as `Panel`
 * provides its container) the rail publishes `--panel-rail-height` onto.
 * Captured by ref into state so it is non-null for the rail's effect, the same
 * one-render-late availability the real Panel container has. */
function inPanel(rail: JSX.Element, store = createDelayRailStore()) {
  function Harness() {
    const targetRef = useRef<HTMLDivElement>(null);
    return (
      <div ref={targetRef} data-testid="target">
        <PanelRailTargetContext.Provider value={targetRef}>
          <DelayRailContext.Provider value={store}>
            {rail}
          </DelayRailContext.Provider>
        </PanelRailTargetContext.Provider>
      </div>
    );
  }
  return render(<Harness />);
}

function targetOf(container: HTMLElement): HTMLElement {
  return container.querySelector('[data-testid="target"]') as HTMLElement;
}

describe("PanelDelayRail", () => {
  beforeEach(() => {
    DrivableResizeObserver.instances = [];
    globalThis.ResizeObserver =
      DrivableResizeObserver as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = realResizeObserver;
  });

  it("renders the delay UI for an active handle in context", () => {
    const store = createDelayRailStore();
    store.register(handle("cmd"));
    const { container } = inPanel(<PanelDelayRail />, store);
    // v3: the rail renders the discrete handle as the glow-band strip (an
    // <svg role="img"> whose accessible name starts "In-flight commands"), not
    // the pre-v3 monospace list.
    expect(
      container.querySelector('[aria-label^="In-flight commands"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-role="glow"]')).not.toBeNull();
  });

  it("renders the rail chrome strip element for an active handle", () => {
    const store = createDelayRailStore();
    store.register(handle("cmd"));
    const { container } = inPanel(<PanelDelayRail />, store);
    expect(container.querySelector("[data-panel-rail]")).not.toBeNull();
  });

  it("has no axe violations with an active handle", async () => {
    const store = createDelayRailStore();
    store.register(handle("cmd"));
    const { container } = inPanel(<PanelDelayRail />, store);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders nothing and sets no rail element when no handles are active (snapshot-stable for no-command widgets)", () => {
    const { container } = inPanel(<PanelDelayRail />);
    // Renders null: no rail element at all, so a no-command widget's Panel DOM
    // is byte-identical to before this rail existed.
    expect(container.querySelector("[data-panel-rail]")).toBeNull();
    expect(
      container.querySelector('[aria-label="In-flight commands"]'),
    ).toBeNull();
    // No var published: the panel reads the `var(--panel-rail-height, 0px)`
    // fallback (effective height 0).
    expect(
      targetOf(container).style.getPropertyValue("--panel-rail-height"),
    ).toBe("");
  });

  it("renders nothing for a registered but idle/instant handle (empty inFlight, nothing to draw)", () => {
    // A meta-vantage / not-yet-dispatched command registers (so its must-consume
    // token is marked) but its CommandDelay would draw nothing, so the rail
    // stays absent, exactly as the inline CommandDelay drew nothing before.
    const store = createDelayRailStore();
    store.register({
      id: "instant",
      inFlight: [],
      shape: "discrete",
      effectiveDelaySeconds: 0,
    });
    const { container } = inPanel(<PanelDelayRail />, store);
    expect(container.querySelector("[data-panel-rail]")).toBeNull();
    expect(
      targetOf(container).style.getPropertyValue("--panel-rail-height"),
    ).toBe("");
  });

  it("publishes its measured height into --panel-rail-height on the panel target", () => {
    const store = createDelayRailStore();
    store.register(handle("cmd"));
    const { container } = inPanel(<PanelDelayRail />, store);
    const rail = container.querySelector("[data-panel-rail]") as HTMLElement;
    drive(rail, 48);
    expect(
      targetOf(container).style.getPropertyValue("--panel-rail-height"),
    ).toBe("48px");
  });

  describe("pin-to-grow (v4)", () => {
    function railButton(): HTMLButtonElement {
      return screen.getByRole("button", {
        name: /signal-delay detail/i,
      }) as HTMLButtonElement;
    }

    it("is a button, collapsed by default (aria-pressed/expanded false), showing the rail summary not the detail list", () => {
      const store = createDelayRailStore();
      store.register(handle("cmd"));
      const { container } = inPanel(<PanelDelayRail />, store);
      const btn = railButton();
      expect(btn).toHaveAttribute("aria-pressed", "false");
      expect(btn).toHaveAttribute("aria-expanded", "false");
      expect(btn).toHaveAttribute("data-pinned", "false");
      // Collapsed = the grazing-glow summary, not the detail list.
      expect(container.querySelector('[data-role="glow"]')).not.toBeNull();
      expect(container.textContent).not.toContain("Launch");
    });

    it("pins on activation and grows the detail IN PLACE (the inline list), unpins on Escape", async () => {
      const user = userEvent.setup();
      const store = createDelayRailStore();
      store.register(handle("cmd"));
      const { container } = inPanel(<PanelDelayRail />, store);
      const btn = railButton();

      await user.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "true");
      expect(btn).toHaveAttribute("aria-expanded", "true");
      // Grown: the fuller inline detail renders in place (the summary glow is
      // replaced by the list), inside the rail button, no separate overlay.
      expect(container.querySelector('[data-role="glow"]')).toBeNull();
      expect(container.textContent).toContain("Launch");
      expect(container.querySelector("[data-delay-float]")).toBeNull();

      await user.keyboard("{Escape}");
      expect(btn).toHaveAttribute("aria-pressed", "false");
      expect(container.querySelector('[data-role="glow"]')).not.toBeNull();
      expect(btn).toHaveFocus();
    });

    it("re-activating collapses it again (toggle)", async () => {
      const user = userEvent.setup();
      const store = createDelayRailStore();
      store.register(handle("cmd"));
      inPanel(<PanelDelayRail />, store);
      const btn = railButton();
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "true");
      await user.click(btn);
      expect(btn).toHaveAttribute("aria-pressed", "false");
    });

    it("has no axe violations while pinned/grown", async () => {
      const user = userEvent.setup();
      const store = createDelayRailStore();
      store.register(handle("cmd"));
      const { container } = inPanel(<PanelDelayRail />, store);
      await user.click(railButton());
      expect(await axe(container)).toHaveNoViolations();
    });

    it("pinned with a stream AND a multi-command discrete handle grows every command", async () => {
      const user = userEvent.setup();
      const store = createDelayRailStore();
      store.register({
        id: "stream",
        inFlight: [],
        shape: "stream",
        effectiveDelaySeconds: 1.6,
        streams: [
          {
            id: "throttle",
            label: "Throttle",
            oneWaySeconds: 1.6,
            inTransit: [{ age: 0, value: 0.5 }],
            echo: [],
            current: 0.5,
          },
        ],
      });
      store.register({
        id: "discrete",
        inFlight: [
          { ...IN_FLIGHT[0], id: "d1", label: "SAS Prograde" },
          { ...IN_FLIGHT[0], id: "d2", label: "Stage" },
        ],
        shape: "discrete",
        effectiveDelaySeconds: 3,
      });
      const { container } = inPanel(<PanelDelayRail />, store);
      await user.click(railButton());
      // Both discrete commands render as pills (plus the stream graph above).
      expect(container.textContent).toContain("SAS Prograde");
      expect(container.textContent).toContain("Stage");
    });
  });

  it("drops --panel-rail-height back to the 0px fallback when the last command completes", () => {
    const store = createDelayRailStore();
    const deregister = store.register(handle("cmd"));
    const { container } = inPanel(<PanelDelayRail />, store);
    const rail = container.querySelector("[data-panel-rail]") as HTMLElement;
    drive(rail, 48);
    const target = targetOf(container);
    expect(target.style.getPropertyValue("--panel-rail-height")).toBe("48px");
    // Command completes: the rail unmounts and removes the var, so the panel
    // falls back to 0px.
    act(() => deregister());
    expect(container.querySelector("[data-panel-rail]")).toBeNull();
    expect(target.style.getPropertyValue("--panel-rail-height")).toBe("");
  });
});
