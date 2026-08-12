import { act, render, screen } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
// Importing the real module runs its module-load registerAugment(...).
import { ScienceOfficerInstrumentDetail } from "./scienceOfficerSections";

const CARRIED = ["science.instruments"];

const renderedTrees: Array<() => void> = [];

function newFixture() {
  return setupStreamFixture({ carriedChannels: CARRIED, pinnedUt: 10 });
}

function renderAugment(fixture: ReturnType<typeof newFixture>, partId: string) {
  const instrument = {
    partId,
    partTitle: "Geiger Counter",
    expId: "radiationScan",
    deployed: false,
    hasData: false,
    rerunnable: null,
    inoperable: false,
    enriched: true,
  };
  const result = render(
    <fixture.Provider>
      <ScienceOfficerInstrumentDetail instrument={instrument} />
    </fixture.Provider>,
  );
  renderedTrees.push(result.unmount);
  return result;
}

afterEach(() => {
  for (const unmount of renderedTrees) unmount();
  renderedTrees.length = 0;
});

describe("ScienceOfficerInstrumentDetail", () => {
  it("renders nothing before any instrument data has arrived", () => {
    const fixture = newFixture();
    renderAugment(fixture, "101");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing when the entry carries no Kerbalism namespace (a stock frame)", () => {
    const fixture = newFixture();
    renderAugment(fixture, "101");
    act(() => {
      fixture.emit("science.instruments", [
        { partId: "101", partName: "Geiger Counter", deployed: false },
      ]);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the issue, running state and file/sample kind for a blocked experiment", async () => {
    const fixture = newFixture();
    renderAugment(fixture, "101");
    act(() => {
      fixture.emit("science.instruments", [
        {
          partId: "101",
          partName: "Geiger Counter",
          deployed: false,
          inoperable: false,
          rerunnable: null,
          dataIsCollectable: false,
          extensions: {
            kerbalism: {
              issue: "no storage",
              runningState: "Running",
              expStatus: "Issue",
              dataRateMBps: 0.002,
              prodFactor: 0.5,
              remainingSampleMass: null,
            },
          },
        },
      ]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("ISSUE");
    expect(banner).toHaveTextContent("FILE");
    expect(banner).toHaveTextContent("no storage");
  });

  it("shows SAMPLE and the remaining mass for a sample-based experiment", async () => {
    const fixture = newFixture();
    renderAugment(fixture, "102");
    act(() => {
      fixture.emit("science.instruments", [
        {
          partId: "102",
          partName: "Mystery Goo Containment Pod",
          deployed: true,
          inoperable: true,
          rerunnable: null,
          dataIsCollectable: false,
          extensions: {
            kerbalism: {
              issue: "",
              runningState: "Running",
              expStatus: "Running",
              dataRateMBps: 0.0005,
              prodFactor: 1,
              remainingSampleMass: 0,
            },
          },
        },
      ]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("RUNNING");
    expect(banner).toHaveTextContent("SAMPLE");
  });

  it("has no axe violations", async () => {
    const fixture = newFixture();
    const { container } = renderAugment(fixture, "101");
    act(() => {
      fixture.emit("science.instruments", [
        {
          partId: "101",
          extensions: {
            kerbalism: { issue: "no storage", expStatus: "Issue" },
          },
        },
      ]);
    });
    await screen.findByRole("status");

    expect(await axe(container)).toHaveNoViolations();
  });
});
