import type { VesselTopology } from "@ksp-gonogo/core";
import { ContributionsProvider, WidgetMetaContext } from "@ksp-gonogo/core";
import { act, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
import { topologyToVesselPartsWire } from "../test/topologyToVesselPartsWire";
// Importing the real module runs its module-load registration of the
// built-in `ship-map.part-meters` contribution (./partMetersContribution.ts,
// a side-effect import inside this file), the same way importing any widget
// runs its own `registerComponent`.
import { ShipMapComponent } from "./index";

/**
 * Proves the self-contribution unify end to end (spec §13.4): ShipMap's
 * compact fill bars come from the aggregated `ship-map.part-meters` slot,
 * not from a hardcoded resource allowlist inside `ShipDiagramSvg`. The
 * built-in `core` contribution is exercised here (it lives in this
 * package); the Kerbalism contribution's OWN pure-function tests live
 * alongside it in `mod/GonogoKerbalismUplink/client/src/ShipMap/`.
 *
 * `WidgetMetaContext` + `ContributionsProvider` are mounted explicitly here
 * (mirrors the app's real `WidgetContributions` wrapper,
 * `GridItemContent.tsx`): `ShipMapComponent` alone, the way `slot.test.tsx`
 * renders it, has no contribution store at all and `useContributions`
 * silently returns empty, same as a bare widget with no dashboard around it.
 */

const TOPOLOGY: VesselTopology = {
  topologySeq: 1,
  rootFlightId: 1,
  parts: [
    {
      flightId: 1,
      persistentId: 1,
      parentFlightId: null,
      name: "mk1pod",
      title: "Mk1 Command Pod",
      manufacturer: "",
      category: "Pods",
      inverseStage: -1,
      crewCapacity: 1,
      maxTemp: 1200,
      crashTolerance: 0,
      dryMass: 0.8,
      orgPos: [0, 0, 0],
      up: [0, 1, 0],
      bounds: { size: { x: 1.25, y: 1.14, z: 1.25 } },
      modules: ["ModuleCommand"],
    },
    {
      flightId: 2,
      persistentId: 2,
      parentFlightId: 1,
      name: "fuelTankSmallFlat",
      title: "FL-T400 Fuel Tank",
      manufacturer: "",
      category: "FuelTank",
      inverseStage: 1,
      crewCapacity: 0,
      maxTemp: 2000,
      crashTolerance: 0,
      dryMass: 0.25,
      orgPos: [0, -1.145, 0],
      up: [0, 1, 0],
      bounds: { size: { x: 1.25, y: 1.85, z: 1.25 } },
      modules: [],
    },
  ],
};

const VESSEL_PARTS_WIRE = topologyToVesselPartsWire(
  TOPOLOGY,
  new Map([
    [
      2,
      {
        resources: {
          LiquidFuel: { amount: 90, maxAmount: 180 },
          Oxidizer: { amount: 100, maxAmount: 220 },
        },
      },
    ],
  ]),
);

const META = {
  componentId: "ship-map",
  contributionSlots: ["ship-map.part-meters", "ship-map.part-meta"] as const,
};

const renderedTrees: Array<() => void> = [];

async function renderShipMap() {
  const fixture = setupStreamFixture({
    carriedChannels: ["vessel.parts"],
    pinnedUt: 10,
  });
  const { unmount, container } = render(
    <fixture.Provider>
      <WidgetMetaContext.Provider value={META}>
        <ContributionsProvider>
          <ShipMapComponent id="ship-map-contrib" w={8} h={10} />
        </ContributionsProvider>
      </WidgetMetaContext.Provider>
    </fixture.Provider>,
  );
  renderedTrees.push(unmount);
  act(() => {
    fixture.emit("vessel.parts", VESSEL_PARTS_WIRE);
  });
  await waitFor(() =>
    expect(screen.getByLabelText("Ship diagram")).toBeTruthy(),
  );
  return { container };
}

describe("ShipMap: self-contribution unify (spec §13.4)", () => {
  afterEach(() => {
    for (const unmount of renderedTrees) unmount();
    renderedTrees.length = 0;
  });

  it("paints the built-in contribution's tones, not the retired resourceColor palette", async () => {
    const { container } = await renderShipMap();
    // "go"/"info" are METER_TONE_FILL's CSS vars for LiquidFuel/Oxidizer
    // (packages/components/src/ShipMap/partMetersContribution.ts's
    // DRAINABLE_TONES); the OLD hardcoded `resourceColor` painted
    // LiquidFuel with `--color-accent-fg`, which must not appear here.
    const fills = Array.from(container.querySelectorAll("rect")).map((r) =>
      r.getAttribute("fill"),
    );
    expect(fills).toContain("var(--color-status-go-bg)");
    // "neutral", not "info": `--color-status-info-bg` is near-invisible as a
    // filled bar against the diagram's dark canvas (see
    // `partMetersContribution.ts`'s own doc comment on this finding).
    expect(fills).toContain("var(--color-text-muted)");
    expect(fills).not.toContain("var(--color-accent-fg)");
    expect(fills).not.toContain("var(--color-status-info-bg)");
  });

  it("composes the contributed percentage into the part's accessible name", async () => {
    await renderShipMap();
    expect(
      screen.getByLabelText(/FL-T400 Fuel Tank.*LiquidFuel 50 percent/),
    ).toBeTruthy();
  });

  it("renders no bars on a part with no contributed meters (the command pod)", async () => {
    await renderShipMap();
    const pod = screen.getByLabelText(/Mk1 Command Pod/);
    // `renderResourceFill`'s own wrapper (`<g pointerEvents="none">`) is the
    // fill-bar marker; a part's unconditional focus-ring `<rect>` is not.
    expect(pod.querySelector('g[pointer-events="none"]')).toBeNull();
  });

  it("has no axe violations with contributed meters rendered", async () => {
    const { container } = await renderShipMap();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
