import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrbitDiagram } from "./OrbitDiagram";

const BASE = {
  sma: 700_000,
  ecc: 0.1,
  apoapsis: 770_000,
  periapsis: 630_000,
  trueAnomaly: 0,
  argPe: 0,
};

describe("OrbitDiagram projected overlay", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders only the current orbit when no projected prop is supplied", () => {
    const { container } = render(<OrbitDiagram {...BASE} />);
    expect(container.querySelectorAll("ellipse")).toHaveLength(1);
  });

  it("renders two ellipses when a projected orbit is supplied", () => {
    const { container } = render(
      <OrbitDiagram
        {...BASE}
        projected={{
          sma: 770_000,
          ecc: 0,
          apoapsis: 770_000,
          periapsis: 770_000,
        }}
      />,
    );
    const ellipses = container.querySelectorAll("ellipse");
    expect(ellipses).toHaveLength(2);
    // Projected ellipse is drawn first (underneath) and is the dashed one.
    expect(ellipses[0].getAttribute("stroke-dasharray")).not.toBeNull();
    expect(ellipses[1].getAttribute("stroke-dasharray")).toBeNull();
  });

  it("expands the viewBox to contain a larger projected apoapsis", () => {
    const { container: plain } = render(<OrbitDiagram {...BASE} />);
    const { container: withProj } = render(
      <OrbitDiagram
        {...BASE}
        projected={{
          sma: 2_000_000,
          ecc: 0.5,
          apoapsis: 3_000_000,
          periapsis: 1_000_000,
        }}
      />,
    );
    const plainVb = plain.querySelector("svg")?.getAttribute("viewBox") ?? "";
    const withVb = withProj.querySelector("svg")?.getAttribute("viewBox") ?? "";
    const plainW = Number.parseFloat(plainVb.split(" ")[2] ?? "0");
    const withW = Number.parseFloat(withVb.split(" ")[2] ?? "0");
    expect(withW).toBeGreaterThan(plainW);
  });
});
