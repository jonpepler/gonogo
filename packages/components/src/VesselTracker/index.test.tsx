import {
  ContributionsProvider,
  clearContributions,
  registerContribution,
  WidgetMetaContext,
} from "@ksp-gonogo/core";
import { act, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { visibleText } from "@ksp-gonogo/ui-kit/testing";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import {
  type StreamFixture,
  setupStreamFixture,
} from "../test/setupStreamFixture";
import { registerCommsDeadlineContribution } from "./commsDeadlineContribution";
import { VesselTrackerComponent } from "./index";

/**
 * The tracker rides the same stream everything else does: `system.vessels` for
 * identity, the dynamic `fleet.<guid>.contact` and `fleet.<guid>.orbit` for the
 * per-vessel facts, and the fleet-wide `fleet.silence` for the reckoning. The
 * dynamic namespace is carried by PREFIX; naming a concrete per-guid topic
 * would leave nothing subscribed and every assertion below would pass against
 * an empty render.
 */

const NOW_UT = 10_000;

const CONTRIBUTIONS_META = {
  componentId: "vessel-tracker",
  contributionSlots: ["vessel-tracker.deadline"] as const,
};

function WithContributions({ children }: { children: ReactNode }) {
  return (
    <WidgetMetaContext.Provider value={CONTRIBUTIONS_META}>
      <ContributionsProvider>{children}</ContributionsProvider>
    </WidgetMetaContext.Provider>
  );
}

function roster() {
  return {
    vessels: [
      {
        vesselId: "probe-1",
        name: "Munar Probe",
        vesselType: 3,
        situation: 3,
        bodyIndex: 2,
        crewCount: { magnitude: 0, unit: "count" },
        crewCapacity: { magnitude: 0, unit: "count" },
        commsConnected: false,
        commsControlSource: 0,
      },
      {
        vesselId: "station-1",
        name: "Kerbin Station",
        vesselType: 1,
        situation: 3,
        bodyIndex: 1,
        crewCount: { magnitude: 3, unit: "count" },
        crewCapacity: { magnitude: 6, unit: "count" },
        commsConnected: true,
        commsControlSource: 2,
      },
    ],
  };
}

function bodies() {
  return {
    bodies: [
      { index: 1, name: "Kerbin", parentIndex: null, radius: 600_000 },
      { index: 2, name: "Mun", parentIndex: 1, radius: 200_000 },
    ],
  };
}

describe("VesselTracker", () => {
  let fixture: StreamFixture;
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    // The built-in comms contribution registers at module load, so a bare
    // clear would drop it for the rest of the file and leave every assertion
    // about a contributed row passing against an empty slot.
    clearContributions();
    registerCommsDeadlineContribution();
    fixture = setupStreamFixture({
      carriedChannels: [
        "system.vessels",
        "system.bodies",
        "vessel.identity",
        "fleet.",
        "silence.",
      ],
      pinnedUt: NOW_UT,
    });
  });

  afterEach(() => {
    for (const unmount of mounted) unmount();
    mounted.length = 0;
    clearContributions();
  });

  function mount(config: { vesselId?: string } = {}) {
    const result = render(
      <fixture.Provider>
        <WithContributions>
          <VesselTrackerComponent config={config} id="vt" w={8} h={12} />
        </WithContributions>
      </fixture.Provider>,
    );
    mounted.push(result.unmount);
    return result;
  }

  function emitBase() {
    act(() => {
      fixture.emit("system.vessels", roster());
      fixture.emit("system.bodies", bodies());
      fixture.emit("vessel.identity", {
        vesselId: "station-1",
        name: "Kerbin Station",
        vesselType: 1,
        situation: 3,
        parentBodyIndex: 1,
      });
    });
  }

  /**
   * The reckoning arrives on the FLEET-WIDE `fleet.silence` roster, not on the
   * per-vessel topic: that is the whole point of the roster, and a test still
   * driving `silence.<guid>.state` would be exercising a path the widget no
   * longer reads.
   *
   * `fleet.<guid>.contact` stays per-vessel and only exists once the widget
   * knows which craft it is tracking, so its subscription lands a frame after
   * the roster does. Emitting before that is silently dropped by the
   * subscription-gated transport, which would leave every assertion below
   * passing against an empty render.
   */
  async function emitSilentProbe(
    over: Record<string, unknown> = {},
    contactOver: Record<string, unknown> = {},
  ) {
    await waitFor(() => {
      expect(fixture.transport.isSubscribed("fleet.silence")).toBe(true);
      expect(fixture.transport.isSubscribed("fleet.probe-1.contact")).toBe(
        true,
      );
    });
    act(() => {
      fixture.emit("fleet.probe-1.contact", {
        connected: false,
        lastContactUt: 8_800,
        ...contactOver,
      });
      fixture.emit("fleet.silence", {
        vessels: [
          {
            vesselId: "probe-1",
            state: "Silent",
            silenceSinceUt: 9_000,
            deadlineUt: 12_000,
            deadlineBasis: "predicted-reacquisition",
            predictedReacquisitionUt: 11_000,
            ...over,
          },
        ],
      });
    });
    // And settled: every section below reads off the reckoning, so a test that
    // asserted before it landed would be asserting against the empty state.
    await waitFor(() =>
      expect(screen.queryByText(/no contact model/i)).toBeNull(),
    );
  }

  describe("which craft it is about", () => {
    it("follows the active vessel by default", async () => {
      mount();
      emitBase();
      await waitFor(() =>
        expect(screen.getByText("Kerbin Station")).toBeTruthy(),
      );
    });

    it("tracks a configured craft that is not the one being flown", async () => {
      // The whole subject of this widget is a craft you cannot see, which by
      // definition is not the one you are flying.
      mount({ vesselId: "probe-1" });
      emitBase();
      await waitFor(() => expect(screen.getByText("Munar Probe")).toBeTruthy());
      expect(screen.queryByText("Kerbin Station")).toBeNull();
    });

    it("says so when no craft has resolved yet", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/no vessel|not available/i),
      );
    });

    it("resolves the craft's body from the body table", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await waitFor(() => expect(visibleText(container)).toContain("Mun"));
    });
  });

  describe("contact facts", () => {
    it("reports when the craft was last heard and how long it has been quiet", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/last heard/i),
      );
      const text = visibleText(container);
      // 10000 - 8800 = 20 min since contact; 10000 - 9000 = 16 min 40 s silent.
      expect(text).toMatch(/20m/);
      expect(text).toMatch(/silence run:/i);
    });

    it("reports a craft never heard from as unknown, not as heard from now", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({}, { lastContactUt: null });
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/last heard/i),
      );
      expect(visibleText(container)).toMatch(/never/i);
    });
  });

  describe("the three deadlines", () => {
    it("shows all three kinds, each named, so none can be read as another", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      const text = visibleText(container);
      expect(text).toMatch(/geometric/i);
      expect(text).toMatch(/operational/i);
      expect(text).toMatch(/declaration/i);
    });

    it("names each deadline's basis rather than leaving the operator to guess", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({ deadlineBasis: "orbital-period" });
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/orbit period/i),
      );
    });

    it("keeps showing the operational row when nothing models it", async () => {
      // A comparison with a silently missing member misleads: two rows read as
      // the complete set and the operator never learns a third kind exists. A
      // SECTION that renders nothing simply is not there, which is different.
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/operational/i),
      );
      expect(visibleText(container)).toMatch(/not modelled/i);
    });

    it("shows a contributed operational limit, naming the resource and its basis", async () => {
      registerContribution({
        id: "test-vt-life-support",
        contributes: "vessel-tracker.deadline",
        deps: [],
        compute: () => [
          {
            target: "probe-1",
            kind: "operational",
            label: "Life support",
            atUt: 11_500,
            basis: "oxygen at current draw",
          },
        ],
      });
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/life support/i),
      );
      expect(visibleText(container)).toMatch(/oxygen at current draw/i);
      expect(visibleText(container)).not.toMatch(/not modelled/i);
    });

    it("ignores a contributed limit that is about a different craft", async () => {
      registerContribution({
        id: "test-vt-other-craft",
        contributes: "vessel-tracker.deadline",
        deps: [],
        compute: () => [
          {
            target: "station-1",
            kind: "operational",
            label: "Life support",
            atUt: 11_500,
            basis: "oxygen at current draw",
          },
        ],
      });
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() =>
        expect(visibleText(container)).toMatch(/operational/i),
      );
      expect(visibleText(container)).toMatch(/not modelled/i);
    });

    it("plots the deadlines it knows on one shared axis", async () => {
      registerContribution({
        id: "test-vt-axis-feed",
        contributes: "vessel-tracker.deadline",
        deps: [],
        compute: () => [
          {
            target: "probe-1",
            kind: "operational",
            label: "Life support",
            atUt: 11_500,
            basis: "oxygen at current draw",
          },
        ],
      });
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      const axis = await screen.findByRole("img", { name: /deadline order/i });
      // The accessible description carries the same ordering the marks draw,
      // so the axis is not a picture only sighted operators can read.
      expect(axis.getAttribute("aria-label")).toMatch(/geometric/i);
      expect(axis.getAttribute("aria-label")).toMatch(/declaration/i);
    });

    it("draws no axis when only one deadline is known", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({
        predictedReacquisitionUt: null,
        deadlineUt: null,
        deadlineBasis: "no-occultation",
      });
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      expect(screen.queryByRole("img", { name: /deadline order/i })).toBeNull();
    });
  });

  describe("the ballistic envelope", () => {
    /** A 100 km circular Kerbin orbit on the dynamic `fleet.<guid>.orbit` topic. */
    async function emitProbeOrbit(over: Record<string, unknown> = {}) {
      await waitFor(() =>
        expect(fixture.transport.isSubscribed("fleet.probe-1.orbit")).toBe(
          true,
        ),
      );
      act(() => {
        fixture.emit("fleet.probe-1.orbit", {
          referenceBodyIndex: 1,
          sma: 700_000,
          ecc: 0,
          inc: 0,
          lan: 0,
          argPe: 0,
          meanAnomalyAtEpoch: 0,
          epoch: NOW_UT,
          mu: 3.5316e12,
          ...over,
        });
      });
    }

    it("reports where the craft is if it did not manoeuvre", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeOrbit();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /envelope/i })).toBeTruthy(),
      );
      const text = visibleText(container);
      // 700 km sma over a 600 km body: 100 km apoapsis and periapsis.
      expect(text).toMatch(/100\.0\s*km/);
      expect(text).toMatch(/ballistic/i);
    });

    it("says the position assumes no manoeuvre, rather than stating it as fact", async () => {
      // Loss of contact does not make a position unknown, it makes it known
      // with a growing envelope, and this is only the innermost point of one.
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeOrbit();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /envelope/i })).toBeTruthy(),
      );
      expect(visibleText(container)).toMatch(/if it did not manoeuvre/i);
    });

    it("renders no envelope section at all before any elements arrive", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      expect(screen.queryByRole("heading", { name: /envelope/i })).toBeNull();
    });

    it("reports no reachable volume, because no delta-V source exists for a dark craft", async () => {
      // The spec wants the volume the craft could be in; `dv.summary` and
      // `dv.stages` are active-vessel topics, so there is nothing to bound it
      // with. Saying so beats drawing a point and calling it the envelope.
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeOrbit();
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /envelope/i })).toBeTruthy(),
      );
      expect(visibleText(container)).toMatch(/reachable volume/i);
      expect(visibleText(container)).toMatch(/no delta-v/i);
    });
  });

  describe("consumables", () => {
    async function emitProbeResources(resources: Record<string, unknown>) {
      await waitFor(() =>
        expect(fixture.transport.isSubscribed("fleet.probe-1.resources")).toBe(
          true,
        ),
      );
      act(() => {
        fixture.emit("fleet.probe-1.resources", { resources });
      });
    }

    it("lists what is in the craft's tanks", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeResources({
        ElectricCharge: { current: 40, max: 100 },
        MonoPropellant: { current: 0, max: 40 },
      });
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /consumables/i }),
        ).toBeTruthy(),
      );
      const text = visibleText(container);
      expect(text).toContain("ElectricCharge");
      expect(text).toContain("MonoPropellant");
    });

    it("shows an emptied tank rather than hiding it", async () => {
      // The reading an operator most wants to see. Hiding it would make "ran
      // out" indistinguishable from "never carried it".
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeResources({ MonoPropellant: { current: 0, max: 40 } });
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /consumables/i }),
        ).toBeTruthy(),
      );
      const text = visibleText(container);
      expect(text).toContain("MonoPropellant");
      expect(text).toMatch(/0\s*units/);
      expect(text).toMatch(/40\s*units/);
    });

    it("makes no claim about when anything runs out", async () => {
      // Core reports what is in the tanks. A rate for an unloaded craft is
      // background simulation, which is a life-support Uplink's domain, so a
      // first-party exhaustion time here would be a model we do not have.
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeResources({ ElectricCharge: { current: 40, max: 100 } });
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /consumables/i }),
        ).toBeTruthy(),
      );
      expect(visibleText(container)).not.toMatch(
        /runs out|exhaust|remaining time|depleted at/i,
      );
    });

    it("renders no consumables section before the topic delivers", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      expect(
        screen.queryByRole("heading", { name: /consumables/i }),
      ).toBeNull();
    });

    it("still renders the section for a craft confirmed to carry nothing", async () => {
      // An empty list is a real answer and a different one from silence.
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await emitProbeResources({});
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /consumables/i }),
        ).toBeTruthy(),
      );
      expect(screen.getByText(/carries no resources/i)).toBeTruthy();
    });
  });

  describe("sections with nothing behind them", () => {
    it("renders no envelope or consumables section when nothing fills them", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      // Absent means gone, heading and all: an empty section with a title is a
      // promise the widget cannot keep.
      expect(
        screen.queryByRole("heading", { name: /envelope|reachable/i }),
      ).toBeNull();
      expect(
        screen.queryByRole("heading", { name: /consumables/i }),
      ).toBeNull();
      expect(screen.queryByRole("heading", { name: /history/i })).toBeNull();
    });

    it("still renders identity and contact with no silence model at all", async () => {
      // A stock install publishes no silence topic, so the comms rows have no
      // model behind them and say so rather than the widget disappearing.
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      act(() => {
        fixture.emit("fleet.probe-1.contact", {
          connected: true,
          lastContactUt: 9_990,
        });
      });
      await waitFor(() =>
        expect(visibleText(container)).toContain("Munar Probe"),
      );
      expect(visibleText(container)).toMatch(/no silence model/i);
    });
  });

  describe("it informs, it never advises", () => {
    it("offers no control to declare a craft lost", async () => {
      // Lostness is an observation about game state, not a decision the
      // operator makes and the app records.
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({ state: "Lost", deadlineBasis: "policy-ceiling" });
      await waitFor(() =>
        expect(screen.getByText(/officially lost/i)).toBeTruthy(),
      );
      for (const button of screen.queryAllByRole("button")) {
        expect(button.textContent ?? "").not.toMatch(
          /lost|give up|abandon|write off|declare/i,
        );
      }
    });

    it("renders no advice or recommendation anywhere on the panel", async () => {
      const { container } = mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({ predictedReacquisitionUt: 20_000 });
      await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
      expect(visibleText(container)).not.toMatch(
        /\b(in trouble|recommend|you should|act now|take action|at risk)\b/i,
      );
    });
  });

  describe("announcements", () => {
    it("announces a declared loss assertively", async () => {
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({ state: "Lost", deadlineBasis: "policy-ceiling" });
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toMatch(/officially lost/i);
    });

    it("announces an overdue craft politely, not as an interruption", async () => {
      // There is still time for a late craft; interrupting overstates the case.
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe({ predictedReacquisitionUt: 9_500 });
      const status = await screen.findByRole("status");
      expect(status.textContent).toMatch(/overdue/i);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("does not live-region a running countdown", async () => {
      mount({ vesselId: "probe-1" });
      emitBase();
      await emitSilentProbe();
      await waitFor(() =>
        expect(screen.getByText(/reacquire expected/i)).toBeTruthy(),
      );
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("has no axe violations while tracking a silent craft", async () => {
    const { container } = mount({ vesselId: "probe-1" });
    emitBase();
    await emitSilentProbe();
    await waitFor(() => expect(visibleText(container)).toMatch(/geometric/i));
    expect(await axe(container)).toHaveNoViolations();
  });
});
