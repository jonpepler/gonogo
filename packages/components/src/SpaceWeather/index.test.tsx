import { clearRegistry, DashboardItemContext } from "@ksp-gonogo/core";
import { KerbalismStormTargetKind, Quality } from "@ksp-gonogo/sitrep-sdk";
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
//
// 2026-08-10 operator pass: each star now gets its OWN diagram (own SVG
// `role="img"`, own aria-label), so a binary system renders TWO diagrams,
// not one fused ring.
//
// CME targets come off the wire (`targetKind`/`targetName` on each storm
// entry), so a vessel in solar orbit reads as its own target rather than
// borrowing a body. `vessel.state.parentBodyName` is now only the fallback
// for a stream that carries no target, which is why some tests still emit
// the four derived-channel inputs (mirrors `AtmosphereProfile`'s own
// `emitBody` helper) and one leaves `vessel.state` unresolved entirely to
// prove the "current body" placeholder still reads sensibly.

const CARRIED_CHANNELS = [
  "kerbalism.spaceweather",
  "vessel.orbit",
  "vessel.flight",
  "vessel.identity",
  "system.bodies",
];

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
  targetKind?: KerbalismStormTargetKind;
  targetName?: string;
}

describe("SpaceWeatherComponent", () => {
  let stream: ReturnType<typeof setupStreamFixture>;

  beforeEach(() => {
    clearRegistry();
    stream = setupStreamFixture({
      carriedChannels: CARRIED_CHANNELS,
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

  /** `vessel.state.parentBodyName` resolution: mirrors `AtmosphereProfile`'s
   *  own `emitBody` test helper (same four inputs, same shape). */
  function emitBody(name: string) {
    act(() => {
      stream.emit("vessel.orbit", {}, { quality: Quality.Loaded });
      stream.emit("vessel.flight", {});
      stream.emit("vessel.identity", { parentBodyIndex: 1 });
      stream.emit("system.bodies", {
        bodies: [
          { name, index: 1, parentIndex: 0, radius: 600_000, orbit: null },
        ],
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

  /** Walks from a star's name text up to the Cluster root two Card widths
   *  are compared against: text -> Value -> Stack -> Card -> Cluster. */
  function clusterRootFor(starNameEl: HTMLElement): HTMLElement {
    const card = starNameEl.parentElement?.parentElement;
    const clusterRoot = card?.parentElement;
    if (!clusterRoot) throw new Error("Could not walk up to the Cluster root");
    return clusterRoot;
  }

  it("packs star cards left with a fixed width instead of stretching them across the row", async () => {
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
    const kerbolName = await screen.findByText("Kerbol");
    const menoetiusName = screen.getByText("Menoetius");
    // Both stars pack into the SAME Cluster row, left-aligned (not
    // space-between, which is what stretched two cards to the far edges).
    const clusterRoot = clusterRootFor(kerbolName);
    expect(clusterRootFor(menoetiusName)).toBe(clusterRoot);
    expect(getComputedStyle(clusterRoot).justifyContent).toBe("flex-start");
    // Cards are a fixed, consistent width regardless of star-name length,
    // so the row packs predictably rather than each card sizing to its
    // own content.
    const kerbolCard = kerbolName.parentElement?.parentElement;
    const menoetiusCard = menoetiusName.parentElement?.parentElement;
    expect(kerbolCard).toHaveStyle({ width: "128px" });
    expect(menoetiusCard).toHaveStyle({ width: "128px" });
  });

  it("packs a five-star system the same way, proving it scales past a pair", async () => {
    renderWidget();
    const stars = [
      { star: "Kerbol", distance: KERBOL_DISTANCE_M },
      { star: "Menoetius", distance: 4_500_000_000_000 },
      { star: "Iota Persei", distance: 8_200_000_000_000 },
      { star: "Rho Draconis", distance: 12_100_000_000_000 },
      { star: "Alpha Kerbi", distance: 6_300_000_000_000 },
    ];
    emit(
      stars,
      stars.map((s) => ({ star: s.star, stormState: 0 as const })),
    );
    const names = await Promise.all(
      stars.map((s) => screen.findByText(s.star)),
    );
    const clusterRoot = clusterRootFor(names[0]);
    for (const name of names) {
      expect(clusterRootFor(name)).toBe(clusterRoot);
      const card = name.parentElement?.parentElement;
      expect(card).toHaveStyle({ width: "128px" });
    }
    expect(getComputedStyle(clusterRoot).justifyContent).toBe("flex-start");
    expect(getComputedStyle(clusterRoot).flexWrap).toBe("wrap");
  });

  it("gives each star its OWN diagram, not one diagram fused across stars", async () => {
    renderWidget();
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
    // One SVG diagram per star: Kerbol's is active (its own CME), Menoetius's
    // is baseline, each with its own aria-label naming its own star.
    const kerbolDiagram = await screen.findByRole("img", {
      name: "Solar activity for Kerbol: CME inbound",
    });
    const menoetiusDiagram = screen.getByRole("img", {
      name: "Solar activity for Menoetius: baseline",
    });
    expect(kerbolDiagram).toBeInTheDocument();
    expect(menoetiusDiagram).toBeInTheDocument();
    // The two diagrams are genuinely separate DOM nodes.
    expect(kerbolDiagram).not.toBe(menoetiusDiagram);
  });

  it("visually distinguishes a quiet ring from an active-CME ring (radius, colour, opacity)", async () => {
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
    const diagram = await screen.findByRole("img", {
      name: "Solar activity for Kerbol: CME impacting",
    });
    const ring = diagram.querySelector("path");
    expect(ring).not.toBeNull();
    // Active (level 1) ring: coloured by severity, not the quiet muted grey,
    // and visibly heavier/more opaque than the quiet baseline (opacity 0.4,
    // stroke-width 1).
    expect(ring?.getAttribute("stroke")).not.toBe("var(--color-text-muted)");
    expect(Number(ring?.getAttribute("stroke-width"))).toBeGreaterThan(1);
    expect(Number(ring?.getAttribute("opacity"))).toBeGreaterThan(0.4);
  });

  it("renders the star itself in a warm colour, never the brand-accent green", async () => {
    renderWidget();
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [{ star: "Kerbol", stormState: 0 }],
    );
    const diagram = await screen.findByRole("img", {
      name: "Solar activity for Kerbol: baseline",
    });
    const starCircle = diagram.querySelector("circle");
    expect(starCircle?.getAttribute("fill")).toBe("var(--color-tag-yellow-fg)");
    expect(starCircle?.getAttribute("fill")).not.toBe("var(--color-accent-fg)");
  });

  it("surfaces an inbound CME with a transit progress bar, Inbound status, and a named target", async () => {
    renderWidget();
    emitBody("Kerbin");
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
    expect(screen.getByText("Inbound to Kerbin")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    const pct = Number(bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(100);
    // Mid-transit (~56%): amber, past calm but not yet the red danger zone.
    expect(bar.firstElementChild).toHaveStyle({
      background: "var(--color-status-warning-bg)",
    });
    // Overall panel badge escalates to the same Inbound severity.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Inbound");
  });

  it("colours a far-out inbound CME calm/cool, never the reassuring brand-accent green", async () => {
    renderWidget();
    emitBody("Kerbin");
    // stormTime 120s out (transit is ~137.47s total) puts progress at ~13%,
    // well inside the "still far away" band.
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 120,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
      ],
    );
    const bar = await screen.findByRole("progressbar");
    const pct = Number(bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThan(33);
    const fill = bar.firstElementChild;
    expect(fill).toHaveStyle({ background: "var(--color-status-info-fg)" });
    expect(fill).not.toHaveStyle({ background: "var(--color-accent-fg)" });
  });

  it("colours a near-impact inbound CME red, never the reassuring brand-accent green", async () => {
    renderWidget();
    emitBody("Kerbin");
    // stormTime 11s out puts progress at ~92%, well inside the "about to
    // arrive" band, while the storm is still only state 1 (Inbound, not
    // yet Impact). This is exactly the case the fix targets: a bar that is
    // almost full is closing in on a threat, not "almost done" in a good
    // way, so it must never render as the default accent green.
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 11,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
        },
      ],
    );
    expect(await screen.findByText("Inbound to Kerbin")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    const pct = Number(bar.getAttribute("aria-valuenow"));
    expect(pct).toBeGreaterThan(66);
    expect(pct).toBeLessThan(100);
    const fill = bar.firstElementChild;
    expect(fill).toHaveStyle({ background: "var(--color-status-nogo-bg)" });
    expect(fill).not.toHaveStyle({ background: "var(--color-accent-fg)" });
  });

  it("names the vessel itself as the target for a solar-orbit CME", async () => {
    renderWidget();
    // A vessel with no body SOI is its OWN storm target: Kerbalism rolls that
    // storm per-vessel (Storm.Update(Vessel), against VesselData.stormDataByStar),
    // so no other craft shares it. No emitBody() at all here, which is the
    // point: the target rides on the wire, it is not derived from a parent body
    // that does not exist.
    emit(
      [{ star: "Kerbol", distance: 41_000_000_000 }],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 200,
          stormDuration: 620,
          dist: 41_000_000_000,
          targetKind: KerbalismStormTargetKind.Vessel,
          targetName: "Jool Transfer Probe",
        },
      ],
    );
    expect(
      await screen.findByText("Inbound to Jool Transfer Probe (this vessel)"),
    ).toBeInTheDocument();
    // Never the body-target phrasing, and never the no-target fallback.
    expect(
      screen.queryByText("Inbound to current body"),
    ).not.toBeInTheDocument();
  });

  it("names the vessel itself on impact too, not just in transit", async () => {
    renderWidget();
    emit(
      [{ star: "Kerbol", distance: 41_000_000_000 }],
      [
        {
          star: "Kerbol",
          stormState: 2,
          stormTime: PINNED_UT - 40,
          stormDuration: 620,
          dist: 41_000_000_000,
          targetKind: KerbalismStormTargetKind.Vessel,
          targetName: "Jool Transfer Probe",
        },
      ],
    );
    expect(
      await screen.findByText("Impacting Jool Transfer Probe (this vessel)"),
    ).toBeInTheDocument();
  });

  it("takes a body target from the wire without needing vessel.state to resolve", async () => {
    renderWidget();
    // The mod now names the body it keyed the slot off, so the derived
    // parentBodyName is a fallback rather than the only source.
    emit(
      [{ star: "Kerbol", distance: KERBOL_DISTANCE_M }],
      [
        {
          star: "Kerbol",
          stormState: 1,
          stormTime: PINNED_UT + 60,
          stormDuration: 300,
          dist: KERBOL_DISTANCE_M,
          targetKind: KerbalismStormTargetKind.Body,
          targetName: "Minmus",
        },
      ],
    );
    expect(await screen.findByText("Inbound to Minmus")).toBeInTheDocument();
    // A body target reads plainly: the "(this vessel)" qualifier is only for
    // the per-vessel case.
    expect(
      screen.queryByText("Inbound to Minmus (this vessel)"),
    ).not.toBeInTheDocument();
  });

  it("falls back to a generic target phrase when vessel.state hasn't resolved yet", async () => {
    renderWidget();
    // No emitBody(): parentBodyName never resolves.
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
    expect(
      await screen.findByText("Inbound to current body"),
    ).toBeInTheDocument();
  });

  it("surfaces an arrived CME as Impact with a full transit bar and a named target", async () => {
    renderWidget();
    emitBody("Kerbin");
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
    expect(screen.getByText("Impacting Kerbin")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    // A fully arrived CME is maximum threat regardless of the percentage
    // figure: always red, never the default accent green.
    expect(bar.firstElementChild).toHaveStyle({
      background: "var(--color-status-nogo-bg)",
    });
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
    emitBody("Kerbin");
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
