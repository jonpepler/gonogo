import {
  ContributionsProvider,
  getAugmentsForSlot,
  WidgetMetaContext,
} from "@ksp-gonogo/core";
import { act, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { NULL_DISPLAY } from "@ksp-gonogo/ui-kit";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { SystemViewComponent } from "../SystemView";
// Side-effect import: registers the real `system-view-vessel-orbits`
// contribution (fleet + comms.network relay graph, Tasks 3/4), the same
// shape-contribution model the Commlinks/Traffic toggles below now gate,
// matching `commsNetworkContribution.integration.test.tsx`/
// `commsTraffic.integration.test.tsx`'s own style.
import "../SystemView/vesselOrbitsContribution";
import { axe } from "../test/axe";
import {
  type StreamFixture,
  setupStreamFixture,
} from "../test/setupStreamFixture";
// Importing the augment module registers it ONCE, at this file's first
// import (module-load self-registration, same lifecycle as
// `registerComponent`): deliberately NOT cleared with `clearAugments()`
// between tests the way `SystemView/slot.test.tsx` clears its ad-hoc,
// per-test test-augments: there is nothing here to re-register between
// tests, so clearing would just permanently empty both slots after the
// first `it()`.
import "./index";
import { __resetFleetCommsTogglesForTests } from "./toggles";

const KERBIN_MU = 3.5316e12;

const META = {
  componentId: "system-view",
  contributionSlots: ["system-view.entities"] as const,
};

/**
 * Integration coverage for the Fleet/Comms augment, post-Task-7
 * reconciliation: `local_docs/design/specs/2026-07-15-system-view-fleet-comms-design.md`
 * described a Phase-1 `.overlay` fill that drew its own straight-line
 * comms-path/command-traffic pulse; that fill is now GONE (see
 * `index.tsx`'s class doc), superseded by the shape-contribution model
 * (Tasks 4-6: the CommNet relay graph, the selected-path highlight, and
 * graph-routed traffic pulses, all drawn by `SystemView`'s own
 * `SystemEntitiesLayer`). This file proves what's LEFT: the augment
 * registers only `.actions`/`.badges`, the two toggles gate that new
 * model's connection-line/pulse entities (not a second draw of their own),
 * and the comms line/pulse render EXACTLY ONCE with the toggles on.
 */
describe("FleetComms: actions + badge augment on SystemView, post-overlay-reconciliation", () => {
  let fixture: StreamFixture;

  beforeEach(() => {
    __resetFleetCommsTogglesForTests();
    fixture = setupStreamFixture({
      carriedChannels: [
        "vessel.orbit",
        "vessel.identity",
        "system.bodies",
        "system.vessels",
        "comms.network",
        "comms.link",
        "system.uplink.pending",
      ],
      pinnedUt: 100,
    });
  });

  /** Mounts SystemView framed on Kerbin with one active vessel directly
   *  linked to home over one edge: the minimal scene a comms line needs a
   *  route to draw on, wrapped in the real contribution providers the
   *  shape-contribution model requires. */
  async function renderDiagram() {
    const result = render(
      <fixture.Provider>
        <WidgetMetaContext.Provider value={META}>
          <ContributionsProvider>
            <SystemViewComponent config={{ frame: "Kerbin" }} id="sv" />
          </ContributionsProvider>
        </WidgetMetaContext.Provider>
      </fixture.Provider>,
    );
    act(() => {
      // `vesselOrbitsContribution.ts` resolves the home node against
      // whichever body carries `isHome: true`. Framing on Kerbin (not the
      // root star, unlike the old Phase-1 overlay's own fixture) is required
      // for the graph's `home` node to resolve to this frame at all.
      fixture.emit("system.bodies", {
        bodies: [
          {
            index: 0,
            name: "Kerbol",
            parentIndex: null,
            radius: 261_600_000,
            gravParameter: 1.1723328e18,
            orbit: null,
          },
          {
            index: 1,
            name: "Kerbin",
            parentIndex: 0,
            radius: 600_000,
            gravParameter: KERBIN_MU,
            isHome: true,
            orbit: {
              sma: 13_599_840_256,
              ecc: 0,
              inc: 0,
              lan: 0,
              argPe: 0,
              meanAnomalyAtEpoch: 3.14,
              epoch: 0,
            },
          },
        ],
      });
      fixture.emit("vessel.identity", {
        vesselId: "v-active",
        name: "Test Ship",
        vesselType: 0,
        situation: 3,
        parentBodyIndex: 1,
      });
      fixture.emit("vessel.orbit", {
        referenceBodyIndex: 1,
        sma: 700_000,
        ecc: 0,
        inc: 0,
        lan: 0,
        argPe: 0,
        meanAnomalyAtEpoch: 0,
        epoch: 100,
        mu: KERBIN_MU,
      });
      fixture.emit("system.vessels", {
        vessels: [
          {
            vesselId: "v-active",
            name: "Test Ship",
            vesselType: 0,
            situation: 3,
            bodyIndex: 1,
            orbit: {
              sma: 700_000,
              ecc: 0,
              inc: 0,
              lan: 0,
              argPe: 0,
              meanAnomalyAtEpoch: 0,
              epoch: 100,
            },
          },
        ],
      });
      fixture.emit("comms.network", {
        nodes: [
          { id: "home", displayName: "KSC", kind: 0 },
          { id: "v-active", displayName: "Test Ship", kind: 2 },
        ],
        edges: [{ a: "home", b: "v-active", active: true }],
      });
    });
    await waitFor(() =>
      expect(screen.getAllByText("Kerbin").length).toBeGreaterThanOrEqual(1),
    );
    return result;
  }

  it("registers only .actions and .badges, not .overlay (the old straight-line draw is gone)", () => {
    const overlay = getAugmentsForSlot("system-view.overlay");
    const actions = getAugmentsForSlot("system-view.actions");
    const badges = getAugmentsForSlot("system-view.badges");
    expect(overlay.map((a) => a.id)).not.toContain("fleet-comms-overlay");
    expect(actions.map((a) => a.id)).toContain("fleet-comms-actions");
    expect(badges.map((a) => a.id)).toContain("fleet-comms-badge");
  });

  it("draws the active vessel's comms route exactly once, via the shape-contribution graph", async () => {
    const { container } = await renderDiagram();
    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '[data-entity-id="comms-edge:home:v-active"]',
        ),
      ).toHaveLength(1);
    });
    // No second, FleetComms-drawn line anywhere in the tree: the only
    // `<line>` elements are the one contributed edge (plus none from a
    // dead overlay augment).
    expect(container.querySelectorAll("line")).toHaveLength(1);
  });

  it("hides the comms route when the Commlinks toggle is switched off, and restores it when switched back on", async () => {
    const user = userEvent.setup();
    const { container } = await renderDiagram();
    await waitFor(() =>
      expect(
        container.querySelector('[data-entity-id="comms-edge:home:v-active"]'),
      ).not.toBeNull(),
    );

    const commlinksButton = screen.getByRole("button", { name: "Commlinks" });
    expect(commlinksButton.getAttribute("aria-pressed")).toBe("true");
    await user.click(commlinksButton);
    expect(commlinksButton.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => {
      expect(
        container.querySelector('[data-entity-id="comms-edge:home:v-active"]'),
      ).toBeNull();
    });

    await user.click(commlinksButton);
    expect(commlinksButton.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => {
      expect(
        container.querySelector('[data-entity-id="comms-edge:home:v-active"]'),
      ).not.toBeNull();
    });
  });

  it("draws a pending-uplink pulse exactly once while the Traffic toggle is on, and none once switched off", async () => {
    const user = userEvent.setup();
    const { container } = await renderDiagram();
    act(() => {
      fixture.emit(
        "system.uplink.pending",
        {
          pending: [
            {
              id: "cmd-1",
              command: "kos.run",
              label: "",
              topic: "kos/1",
              vantage: "KSC",
              dispatchedAt: 90,
              oneWaySeconds: 1_000_000,
            },
          ],
        },
        { deliveredAt: 95 },
      );
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          '[data-pulse-edge-id="comms-edge:home:v-active"]',
        ),
      ).toHaveLength(1);
    });

    const trafficButton = screen.getByRole("button", { name: "Traffic" });
    expect(trafficButton.getAttribute("aria-pressed")).toBe("true");
    await user.click(trafficButton);
    expect(trafficButton.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() => {
      expect(container.querySelector("[data-pulse-edge-id]")).toBeNull();
    });
  });

  it("badge shows the unknown state before comms.link has ever delivered a sample", async () => {
    await renderDiagram();
    expect(screen.getByTestId("fleet-comms-badge").textContent).toBe(
      NULL_DISPLAY,
    );
  });

  it("badge tracks comms.link connected/disconnected", async () => {
    await renderDiagram();

    act(() => {
      fixture.emit("comms.link", { connected: true });
    });
    await waitFor(() => {
      expect(screen.getByTestId("fleet-comms-badge").textContent).toBe("LINK");
    });

    act(() => {
      fixture.emit("comms.link", { connected: false });
    });
    await waitFor(() => {
      expect(screen.getByTestId("fleet-comms-badge").textContent).toBe(
        "NO LINK",
      );
    });
  });

  it("has no axe violations with both remaining slots filled", async () => {
    // `renderDiagram()` already mounts the diagram with both slots filled
    // and its data emitted: a second mount of the same widget added nothing
    // to scan, and left a tree that was still mid-first-frame while axe's
    // long async traversal ran.
    const { container } = await renderDiagram();
    act(() => {
      fixture.emit("comms.link", { connected: true });
    });
    // `comms.link` rides `useTelemetry` (the delayed `TimelineStore` frame),
    // so unlike `useLatestValue`'s synchronous update the badge's re-render
    // can land a tick after `act()` returns. Settle it via `waitFor` (itself
    // act-wrapped) BEFORE the async `axe()` scan starts: otherwise that
    // pending re-render can land mid-scan, outside any act() boundary, and
    // React logs a spurious "not wrapped in act" warning.
    await waitFor(() => {
      expect(screen.getByTestId("fleet-comms-badge").textContent).toBe("LINK");
    });
    expect(await axe(container)).toHaveNoViolations();
  });
});
