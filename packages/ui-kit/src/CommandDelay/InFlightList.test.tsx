import { render, screen } from "@ksp-gonogo/test-utils";
import { describe, expect, it } from "vitest";
import { axe } from "../test/axe";
import { InFlightList, type InFlightListItem } from "./InFlightList";

const ITEMS: InFlightListItem[] = [
  { id: "1", label: "run boot.ks", etaSeconds: 4, phase: "in-transit" },
  { id: "2", label: "run land.ks", etaSeconds: 12, phase: "awaiting-reply" },
  { id: "3", label: "run abort.ks", etaSeconds: null, phase: "lost" },
];

describe("InFlightList", () => {
  it("renders nothing for an empty set", () => {
    const { container } = render(<InFlightList items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per item, with an accessible label and a countdown", () => {
    render(<InFlightList items={ITEMS} />);
    const list = screen.getByLabelText("In-flight commands");
    expect(list).toHaveTextContent("run boot.ks");
    expect(list).toHaveTextContent("run land.ks");
    expect(list).toHaveTextContent("run abort.ks");
    // in-transit: a countdown formatted from etaSeconds.
    expect(list).toHaveTextContent("4s");
  });

  it("shows the bare phase word when etaSeconds is null (no ETA to count)", () => {
    render(<InFlightList items={ITEMS} />);
    expect(screen.getByLabelText("In-flight commands")).toHaveTextContent(
      "lost",
    );
  });

  it("accepts a custom aria-label", () => {
    render(<InFlightList items={ITEMS} ariaLabel="Uplink queue" />);
    expect(screen.getByLabelText("Uplink queue")).toBeTruthy();
  });

  it("has no axe violations across phases, incl. the error tones", async () => {
    const { container } = render(<InFlightList items={ITEMS} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe('variant="rail" (v3 height-graph strip)', () => {
    it("renders an svg strip with one blip per item, not the monospace list", () => {
      const { container } = render(
        <InFlightList items={ITEMS} variant="rail" />,
      );
      // The strip is an <svg role="img">, no monospace row list.
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute("role", "img");
      expect(container.querySelectorAll('[data-role="blip"]')).toHaveLength(
        ITEMS.length,
      );
      // No monospace list root in the rail rendering.
      expect(container.textContent).not.toContain("run boot.ks");
    });

    it("draws the two 3T zone dividers, shared with ControlDelayStream", () => {
      const { container } = render(
        <InFlightList items={ITEMS} variant="rail" />,
      );
      expect(container.querySelectorAll("[data-divider]")).toHaveLength(2);
    });

    it("carries an in-flight count in its accessible name", () => {
      render(<InFlightList items={ITEMS} variant="rail" />);
      expect(
        screen.getByRole("img", { name: /3 in flight/ }),
      ).toBeInTheDocument();
    });

    it("renders nothing for an empty set", () => {
      const { container } = render(<InFlightList items={[]} variant="rail" />);
      expect(container).toBeEmptyDOMElement();
    });

    it("has no axe violations", async () => {
      const { container } = render(
        <InFlightList items={ITEMS} variant="rail" />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
