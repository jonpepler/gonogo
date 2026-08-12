import { act, render, screen } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
// Importing the real module runs its module-load registerAugment(...).
import { ScienceOfficerDriveBadges } from "./scienceOfficerBadges";

const CARRIED = ["science.experiments", "science.lab"];

const renderedTrees: Array<() => void> = [];

function newFixture() {
  return setupStreamFixture({ carriedChannels: CARRIED, pinnedUt: 10 });
}

function renderAugment(fixture: ReturnType<typeof newFixture>) {
  const result = render(
    <fixture.Provider>
      <ScienceOfficerDriveBadges instruments={null} dataAmount={0} />
    </fixture.Provider>,
  );
  renderedTrees.push(result.unmount);
  return result;
}

afterEach(() => {
  for (const unmount of renderedTrees) unmount();
  renderedTrees.length = 0;
});

const FILE_ENTRY = {
  partName: "Hard Drive",
  location: "container",
  subjectId: "radiationScan@KerbinInSpaceLow",
  extensions: {
    kerbalism: {
      dataSizeMB: 12.5,
      kind: "file",
      storageCapacityMB: 512,
      storageUsedMB: 20,
      transmitRateMBps: 0.004,
      transmitting: true,
    },
  },
};

const SAMPLE_ENTRY = {
  partName: "Hard Drive",
  location: "container",
  subjectId: "mysteryGoo@KerbinSrfLandedLaunchPad",
  extensions: {
    kerbalism: {
      dataSizeMB: 7.5,
      kind: "sample",
      sampleMass: 0.0125,
      storageCapacityMB: 512,
      storageUsedMB: 20,
      transmitRateMBps: 0,
      transmitting: false,
    },
  },
};

describe("ScienceOfficerDriveBadges", () => {
  it("renders nothing before any experiment data has arrived", () => {
    const fixture = newFixture();
    renderAugment(fixture);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing for a stock frame (no Kerbalism namespace)", () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        { partName: "Mystery Goo", location: "experiment" },
      ]);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("summarises file/sample counts, drive capacity and transmit state", async () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [FILE_ENTRY, SAMPLE_ENTRY]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("1 file");
    expect(banner).toHaveTextContent("1 sample");
    expect(banner).toHaveTextContent("Drive 20/512 MB");
    expect(banner).toHaveTextContent("TX 1 file");
  });

  it("adds the lab analysis rate when a lab frame has landed", async () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [FILE_ENTRY]);
      fixture.emit("science.lab", [
        {
          partName: "Mobile Processing Lab MPL-LG-2",
          extensions: {
            kerbalism: { analysisRateMBps: 0.0008, effectiveRateMBps: 0.0012 },
          },
        },
      ]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("Lab");
    expect(banner).toHaveTextContent("MB/s");
  });

  it("has no axe violations", async () => {
    const fixture = newFixture();
    const { container } = renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [FILE_ENTRY, SAMPLE_ENTRY]);
    });
    await screen.findByRole("status");

    expect(await axe(container)).toHaveNoViolations();
  });
});
