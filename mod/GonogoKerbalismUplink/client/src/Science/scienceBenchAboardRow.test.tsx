import { act, render, screen } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { setupStreamFixture } from "../test/setupStreamFixture";
// Importing the real module runs its module-load registerAugment(...).
import { ScienceBenchAboardRowDetail } from "./scienceBenchAboardRow";

const CARRIED = ["science.experiments", "science.experimentBreakdown"];
const SUBJECT_ID = "radiationScan@KerbinInSpaceLow";

const renderedTrees: Array<() => void> = [];

function newFixture() {
  return setupStreamFixture({ carriedChannels: CARRIED, pinnedUt: 10 });
}

function renderAugment(fixture: ReturnType<typeof newFixture>) {
  const result = render(
    <fixture.Provider>
      <ScienceBenchAboardRowDetail subjectId={SUBJECT_ID} />
    </fixture.Provider>,
  );
  renderedTrees.push(result.unmount);
  return result;
}

afterEach(() => {
  for (const unmount of renderedTrees) unmount();
  renderedTrees.length = 0;
});

describe("ScienceBenchAboardRowDetail", () => {
  it("renders nothing before any data has arrived", () => {
    const fixture = newFixture();
    renderAugment(fixture);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing for a subject with no Kerbalism-tagged results", () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        { subjectId: SUBJECT_ID, partName: "Hard Drive" },
      ]);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lists the file/sample kind and size for every stored result of the subject", async () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        {
          subjectId: SUBJECT_ID,
          partName: "Hard Drive",
          extensions: {
            kerbalism: {
              dataSizeMB: 12.5,
              sciencePerMB: 1.6,
              kind: "file",
              transmitting: true,
            },
          },
        },
        // A different subject: must not leak into this row.
        {
          subjectId: "mysteryGoo@KerbinSrfLandedLaunchPad",
          partName: "Hard Drive",
          extensions: { kerbalism: { dataSizeMB: 7.5, kind: "sample" } },
        },
      ]);
    });

    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent("FILE");
    expect(banner).not.toHaveTextContent("SAMPLE");
  });

  it("adds the per-subject ledger (percent collected, times completed)", async () => {
    const fixture = newFixture();
    renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        {
          subjectId: SUBJECT_ID,
          partName: "Hard Drive",
          extensions: { kerbalism: { dataSizeMB: 12.5, kind: "file" } },
        },
      ]);
      fixture.emit("science.experimentBreakdown", [
        {
          subjectId: SUBJECT_ID,
          extensions: {
            kerbalism: {
              scienceRemainingTotal: 30,
              percentCollectedTotal: 0.25,
              scienceCollectedInFlight: 6.5,
              timesCompleted: 1,
            },
          },
        },
      ]);
    });

    // Rendered through the canonical <Unit>, not a hand-typed "%" string:
    // the magnitude and the symbol/word land as separate nodes.
    const banner = await screen.findByRole("status");
    expect(banner).toHaveTextContent(/25\s*%/);
    expect(banner).toHaveTextContent("collected");
    expect(banner).toHaveTextContent("1 run");
  });

  it("has no axe violations", async () => {
    const fixture = newFixture();
    const { container } = renderAugment(fixture);
    act(() => {
      fixture.emit("science.experiments", [
        {
          subjectId: SUBJECT_ID,
          extensions: { kerbalism: { dataSizeMB: 12.5, kind: "file" } },
        },
      ]);
    });
    await screen.findByRole("status");

    expect(await axe(container)).toHaveNoViolations();
  });
});
