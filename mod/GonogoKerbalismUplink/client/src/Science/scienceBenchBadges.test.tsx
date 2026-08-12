import { act, render, screen } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
// Importing the real module runs its module-load registerAugment(...).
import { ScienceBenchDriveBadges } from "./scienceBenchBadges";

const CARRIED = ["science.experiments"];

const renderedTrees: Array<() => void> = [];

function newFixture() {
  return setupStreamFixture({ carriedChannels: CARRIED, pinnedUt: 10 });
}

function renderAugment(fixture: ReturnType<typeof newFixture>) {
  const result = render(
    <fixture.Provider>
      <ScienceBenchDriveBadges breakdown={null} />
    </fixture.Provider>,
  );
  renderedTrees.push(result.unmount);
  return result;
}

afterEach(() => {
  for (const unmount of renderedTrees) unmount();
  renderedTrees.length = 0;
});

describe("ScienceBenchDriveBadges", () => {
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

  it("summarises file/sample counts and transmit state", async () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        {
          partName: "Hard Drive",
          extensions: {
            kerbalism: { dataSizeMB: 12.5, kind: "file", transmitting: true },
          },
        },
        {
          partName: "Hard Drive",
          extensions: { kerbalism: { dataSizeMB: 7.5, kind: "sample" } },
        },
      ]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("1 file");
    expect(banner).toHaveTextContent("1 sample");
    expect(banner).toHaveTextContent("TX 1 file");
  });

  it("has no axe violations", async () => {
    const fixture = newFixture();
    const { container } = renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        {
          partName: "Hard Drive",
          extensions: { kerbalism: { dataSizeMB: 12.5, kind: "file" } },
        },
      ]);
    });
    await screen.findByRole("status");

    expect(await axe(container)).toHaveNoViolations();
  });
});
