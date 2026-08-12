import { DashboardItemContext } from "@ksp-gonogo/core";
import { act, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import {
  type StreamFixture,
  setupStreamFixture,
} from "../test/setupStreamFixture";
import { AstronautComplexComponent } from "./index";

/**
 * Real-provider integration test: the widget runs off a genuine stream
 * (`setupStreamFixture` = real `TelemetryProvider`/`TelemetryClient`/
 * `TimelineStore` over a `StubTransport`), reading the `spaceCenter.astronautComplex`
 * applicant pool, the `spaceCenter.crewRoster` roster and `career.status`'s
 * funds, and dispatching the real `career.crew.hire` command (asserted against
 * `fixture.transport.sentCommands`). No hooks are mocked.
 */
const CARRIED = [
  "spaceCenter.astronautComplex",
  "spaceCenter.crewRoster",
  "career.status",
  "career.crew.hire",
];

// A generous funds balance so affordability never blocks a hire unless a test
// deliberately lowers it.
function emitFunds(fixture: StreamFixture, funds: number | null) {
  fixture.emit("career.status", { economy: { funds } });
}

function emitComplex(
  fixture: StreamFixture,
  complex: {
    applicants: Array<{
      name: string;
      trait: string;
      level: number;
      hireCost: number;
    }>;
    activeCrew: number;
    crewCapacity: number;
  },
) {
  fixture.emit("spaceCenter.astronautComplex", complex);
}

const APPLICANTS = [
  { name: "Desdin Kerman", trait: "Scientist", level: 0, hireCost: 24000 },
  { name: "Limmy Kerman", trait: "Pilot", level: 0, hireCost: 24000 },
];

describe("AstronautComplexComponent", () => {
  let fixture: StreamFixture;

  beforeEach(() => {
    fixture = setupStreamFixture({ carriedChannels: CARRIED, pinnedUt: 10 });
  });

  function renderWidget(id = "astronaut-complex") {
    return render(
      <fixture.Provider>
        <DashboardItemContext.Provider value={{ instanceId: id }}>
          <AstronautComplexComponent config={{}} id={id} w={6} h={8} />
        </DashboardItemContext.Provider>
      </fixture.Provider>,
    );
  }

  it("renders the panel and a career-only empty state before telemetry", () => {
    renderWidget();
    expect(screen.getByText(/ASTRONAUT COMPLEX/i)).toBeInTheDocument();
    expect(screen.getByText(/career mode only/i)).toBeInTheDocument();
  });

  it("shows the applicant pool with trait, level and hire cost, plus funds", async () => {
    renderWidget();
    act(() => {
      emitFunds(fixture, 500000);
      emitComplex(fixture, {
        applicants: APPLICANTS,
        activeCrew: 3,
        crewCapacity: 13,
      });
    });

    expect(await screen.findByText("Desdin Kerman")).toBeInTheDocument();
    expect(screen.getByText("Limmy Kerman")).toBeInTheDocument();
    // Funds readout is in-widget (CLAUDE.md funds rule): the "Funds" label.
    expect(screen.getByText("Funds")).toBeInTheDocument();
    // Crew cap line.
    expect(screen.getByText(/Crew 3 \/ 13/)).toBeInTheDocument();
  });

  it("dispatches career.crew.hire with the applicant name after arm-then-confirm", async () => {
    const user = userEvent.setup();
    renderWidget();
    act(() => {
      emitFunds(fixture, 500000);
      emitComplex(fixture, {
        applicants: APPLICANTS,
        activeCrew: 3,
        crewCapacity: 13,
      });
    });

    // First click arms; the label flips to Confirm.
    const hire = await screen.findByRole("button", {
      name: /^Hire Desdin Kerman/,
    });
    await user.click(hire);
    const confirm = await screen.findByRole("button", {
      name: /^Confirm hire of Desdin Kerman/,
    });
    await user.click(confirm);

    await waitFor(() => {
      const sent = fixture.transport.sentCommands.find(
        (c) => c.command === "career.crew.hire",
      );
      expect(sent).toBeDefined();
      expect(sent?.args).toEqual({ applicantName: "Desdin Kerman" });
    });
  });

  it("disables hire when funds are short of the cost", async () => {
    renderWidget();
    act(() => {
      emitFunds(fixture, 1000); // well under the 24000 hire cost
      emitComplex(fixture, {
        applicants: APPLICANTS,
        activeCrew: 3,
        crewCapacity: 13,
      });
    });

    const hire = await screen.findByRole("button", {
      name: /Hire Desdin Kerman.*Insufficient funds/,
    });
    expect(hire).toBeDisabled();
  });

  it("marks the roster full and disables hire at the Astronaut Complex cap", async () => {
    renderWidget();
    act(() => {
      emitFunds(fixture, 500000);
      emitComplex(fixture, {
        applicants: APPLICANTS,
        activeCrew: 5,
        crewCapacity: 5,
      });
    });

    expect(await screen.findByText(/FULL/)).toBeInTheDocument();
    const hire = screen.getByRole("button", {
      name: /Hire Desdin Kerman.*Roster full/,
    });
    expect(hire).toBeDisabled();
  });

  it("renders the hired-crew roster with each member's status", async () => {
    renderWidget();
    act(() => {
      emitFunds(fixture, 500000);
      emitComplex(fixture, {
        applicants: [],
        activeCrew: 2,
        crewCapacity: 13,
      });
      fixture.emit("spaceCenter.crewRoster", [
        {
          name: "Jebediah Kerman",
          trait: "Pilot",
          experienceLevel: 5,
          available: true,
          unavailableReason: "",
        },
        {
          name: "Bill Kerman",
          trait: "Engineer",
          experienceLevel: 3,
          available: false,
          unavailableReason: "On mission",
        },
      ]);
    });

    expect(await screen.findByText("Jebediah Kerman")).toBeInTheDocument();
    expect(screen.getByText("On mission")).toBeInTheDocument();
  });

  it("has no axe violations with a populated pool and roster", async () => {
    const { container } = renderWidget();
    act(() => {
      emitFunds(fixture, 500000);
      emitComplex(fixture, {
        applicants: APPLICANTS,
        activeCrew: 3,
        crewCapacity: 13,
      });
      fixture.emit("spaceCenter.crewRoster", [
        {
          name: "Jebediah Kerman",
          trait: "Pilot",
          experienceLevel: 5,
          available: true,
          unavailableReason: "",
        },
      ]);
    });
    await screen.findByText("Desdin Kerman");
    expect(await axe(container)).toHaveNoViolations();
  });
});
