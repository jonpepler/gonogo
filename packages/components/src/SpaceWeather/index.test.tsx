import { clearRegistry, DashboardItemContext } from "@ksp-gonogo/core";
import { act, render, screen } from "@ksp-gonogo/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
import { SpaceWeatherComponent } from "./index";

// SpaceWeather reads the real `kerbalism.spaceweather` Topic (canonical
// one-arg useTelemetry, the 2026-08-10 sun-vantage reframe): Stars, Storms,
// StormEjectionSpeed. It is strictly sun-bound now, no vessel dose/belt
// content (that moved to ShipSystems/CrewStatus), so these tests drive it
// through a real stream and assert on stars/CME cards only.

const PINNED_UT = 149_489;
const KERBOL_DISTANCE_M = 13_599_840_256; // stock Kerbin-orbit distance
const STORM_EJECTION_SPEED_MPS = 98_931_511.14; // 0.33c default

interface Star {
  star: string;
  distance: number;
}

interface Storm {
  star: string;
  stormState: 0 | 1 | 2;
  stormTime?: number;
  stormDuration?: number;
  dist?: number;
}

describe("SpaceWeatherComponent", () => {
  let stream: ReturnType<typeof setupStreamFixture>;

  beforeEach(() => {
    clearRegistry();
    stream = setupStreamFixture({
      carriedChannels: ["kerbalism.spaceweather"],
      pinnedUt: PINNED_UT,
    });
  });

  function renderWidget(size = { w: 8, h: 11 }) {
    return render(
      <stream.Provider>
        <DashboardItemContext.Provider value={{ instanceId: "sw-test" }}>
          <SpaceWeatherComponent
            config={{}}
            id="sw-test"
            w={size.w}
            h={size.h}
          />
        </DashboardItemContext.Provider>
      </stream.Provider>,
    );
  }

  function emit(stars: Star[], storms: Storm[]) {
    act(() => {
      stream.emit("kerbalism.spaceweather", {
        stars: stars.map((s) => ({
          star: s.star,
          direction: { x: 1, y: 0, z: 0 },
          distance: s.distance,
        })),
        storms,
        stormEjectionSpeed: STORM_EJECTION_SPEED_MPS,
      });
    });
  }

  it("shows a Quiet status and the star card with no storms active", async () => {
    renderWidget();
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [{ star: "Kerbol", stormState: 0 }],
    );
    expect(await screen.findByText("Kerbol")).toBeInTheDocument();
    expect(screen.getByText("Quiet")).toBeInTheDocument();
    expect(screen.getByText("No inbound CMEs detected.")).toBeInTheDocument();
  });

  it("renders a card per star, star-agnostic across a binary pair", async () => {
    renderWidget();
    emit(
      [
        { star: "Kerbol", distance: KERBOL_DISTANCE_M },
        { star: "Menoetius", distance: 4_500_000_000_000 },
      ],
      [
        { star: "Kerbol", stormState: 0 },
        { star: "Menoetius", stormState: 0 },
      ],
    );
    expect(await screen.findByText("Kerbol")).toBeInTheDocument();
    expect(screen.getByText("Menoetius")).toBeInTheDocument();
  });

  it("surfaces an inbound CME with a transit progress bar and Inbound status", async () => {
    renderWidget();
    // Departs 137.47s before impact at STORM_EJECTION_SPEED_MPS across
    // KERBOL_DISTANCE_M; stormTime 60s after the pinned UT puts the widget
    // partway through transit (progress strictly between 0 and 100).
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 60,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
      ],
    );
    expect(await screen.findAllByText("Inbound")).not.toHaveLength(0);
    const bar = screen.getByRole("progressbar");
    const pct = Number(bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
    // Overall panel badge escalates to the same Inbound severity.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Inbound");
  });

  it("surfaces an arrived CME as Impact with a full transit bar", async () => {
    renderWidget();
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 2,
          stormTime: PINNED_UT - 20,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
      ],
    );
    expect(await screen.findAllByText("Impact")).not.toHaveLength(0);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("never reads or displays anything from storm_generation (only StormState/StormTime/Dist)", async () => {
    renderWidget();
    // A storm entry with stormState 0 carries no StormTime/StormDuration/Dist
    // on the real wire (the mod zeroes them, see KerbalismStormEntry's own
    // doc comment): the widget must render it as fully quiet, not surface any
    // transit data for it.
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [{ star: "Kerbol", stormState: 0 }],
    );
    await screen.findByText("Kerbol");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText("Inbound")).not.toBeInTheDocument();
    expect(screen.queryByText("Impact")).not.toBeInTheDocument();
  });

  it("announces the mission-state via a polite live region", async () => {
    renderWidget();
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 2,
          stormTime: PINNED_UT - 20,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
      ],
    );
    await screen.findAllByText("Impact");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Impact");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("has no axe violations", async () => {
    const { container } = renderWidget();
    emit(
      [
        { star: "Kerbol", distance: KERBOL_DISTANCE_M },
        { star: "Menoetius", distance: 4_500_000_000_000 },
      ],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 60,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
        { star: "Menoetius", stormState: 0 },
      ],
    );
    expect(await screen.findAllByText("Kerbol")).not.toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});
