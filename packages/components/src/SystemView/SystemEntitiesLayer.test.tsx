import { fireEvent, render, screen } from "@ksp-gonogo/test-utils";
import { describe, expect, it, vi } from "vitest";
import { axe } from "../test/axe";
import { SystemEntitiesLayer } from "./SystemEntitiesLayer";
import type { SystemEntitiesContext, SystemEntity } from "./systemEntities";

const CTX: SystemEntitiesContext = {
  parentName: "Kerbin",
  width: 400,
  height: 400,
  plotScale: 1e-5,
  center: { x: 0, y: 0 },
};

const POINT: SystemEntity = {
  id: "vessel-1",
  position: {
    kind: "orbit",
    parentName: "Kerbin",
    sma: 1_000_000,
    ecc: 0,
    lan: 0,
    argPe: 0,
    trueAnomaly: 0,
  },
  shape: { kind: "point" },
  meta: { name: "Kerbal X" },
};

const RING: SystemEntity = {
  id: "ring-1",
  position: {
    kind: "orbit",
    parentName: "Kerbin",
    sma: 1_000_000,
    ecc: 0.3,
    lan: 10,
    argPe: 5,
    trueAnomaly: 0,
  },
  shape: { kind: "orbit-path" },
};

const VESSEL_RING: SystemEntity = {
  id: "vessel-orbit:v-relay",
  vesselId: "v-relay",
  position: {
    kind: "orbit",
    parentName: "Kerbin",
    sma: 1_000_000,
    ecc: 0.3,
    lan: 10,
    argPe: 5,
    trueAnomaly: 0,
  },
  shape: { kind: "orbit-path" },
  meta: { name: "Comsat Relay-1" },
};

const LINK: SystemEntity = {
  id: "link-1",
  position: { kind: "fixed", parentName: "Kerbin", xMetres: 0, yMetres: 0 },
  shape: {
    kind: "connection-line",
    to: { kind: "fixed", parentName: "Kerbin", xMetres: 200_000, yMetres: 0 },
  },
};

const BLOB: SystemEntity = {
  id: "cme-1",
  position: { kind: "fixed", parentName: "Kerbin", xMetres: 0, yMetres: 0 },
  shape: { kind: "blob", radiusMetres: 300_000 },
};

const TRAVELLING_PULSE: SystemEntity = {
  id: "cme-pulse-1",
  position: { kind: "fixed", parentName: "Kerbin", xMetres: 0, yMetres: 0 },
  shape: {
    kind: "travelling-pulse",
    to: { kind: "fixed", parentName: "Kerbin", xMetres: 500_000, yMetres: 0 },
    segmentLengthMetres: 100_000,
  },
};

describe("SystemEntitiesLayer", () => {
  it("renders nothing when no entity projects onto the current frame", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[]} ctx={CTX} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("draws a point as a circle at its projected position", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[POINT]} ctx={CTX} />,
    );
    const circle = container.querySelector(
      '[data-entity-id="vessel-1"] circle',
    );
    expect(circle).not.toBeNull();
    expect(circle?.getAttribute("cx")).toBe("10");
    expect(circle?.getAttribute("cy")).toBe("0");
  });

  it("draws an orbit-path as a rotated ellipse", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[RING]} ctx={CTX} />,
    );
    const g = container.querySelector('g[data-entity-id="ring-1"]');
    expect(g?.getAttribute("transform")).toBe("rotate(15)");
    expect(g?.querySelector("ellipse")).not.toBeNull();
  });

  it("also draws a small dot at the orbit-path entity's own declared anomaly, OUTSIDE the ring's rotated group", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[RING]} ctx={CTX} />,
    );
    const g = container.querySelector('g[data-entity-id="ring-1"]');
    // The dot is NOT a child of the rotated ellipse group: its own
    // coordinates are already fully resolved (bodyPosition bakes in
    // lan+argPe+trueAnomaly), so nesting it inside a second `rotate()`
    // would rotate an already-rotated point a second time.
    expect(g?.querySelector("circle")).toBeNull();
    const dot = container.querySelector('circle[data-entity-dot-id="ring-1"]');
    expect(dot).not.toBeNull();
    // RING: sma=1e6, ecc=0.3, lan=10, argPe=5, trueAnomaly=0, plotScale=1e-5.
    expect(Number(dot?.getAttribute("cx"))).toBeCloseTo(6.7615, 3);
    expect(Number(dot?.getAttribute("cy"))).toBeCloseTo(1.8117, 3);
  });

  it("draws a connection-line between its two projected endpoints", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[LINK]} ctx={CTX} />,
    );
    const line = container.querySelector('line[data-entity-id="link-1"]');
    expect(line?.getAttribute("x1")).toBe("0");
    expect(line?.getAttribute("x2")).toBe("2");
  });

  it("draws a blob as a circle sized by radiusMetres * plotScale", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[BLOB]} ctx={CTX} />,
    );
    const circle = container.querySelector('circle[data-entity-id="cme-1"]');
    expect(Number(circle?.getAttribute("r"))).toBeCloseTo(3, 6);
  });

  it("draws a travelling-pulse as a segment positioned+rotated onto its apex->tip bearing, not a static path shape", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[TRAVELLING_PULSE]} ctx={CTX} />,
    );
    const group = container.querySelector('[data-entity-id="cme-pulse-1"]');
    expect(group?.tagName).toBe("g");
    // Apex (0,0) -> tip (5,0): a purely horizontal bearing, angle 0.
    expect(group?.getAttribute("transform")).toBe("translate(0 0) rotate(0)");
    const line = group?.querySelector("line");
    expect(line).not.toBeNull();
    // The segment is drawn in the group's own LOCAL frame (0 -> segment
    // length), clamped to the apex->tip span (5 user units here): the
    // group's transform does the positioning, not the line's own endpoints.
    expect(line?.getAttribute("x1")).toBe("0");
    expect(Number(line?.getAttribute("x2"))).toBeCloseTo(1, 6); // 100_000m * 1e-5
    expect(line?.getAttribute("y1")).toBe("0");
    expect(line?.getAttribute("y2")).toBe("0");
    expect(
      container.querySelector('path[data-entity-id="cme-pulse-1"]'),
    ).toBeNull();
  });

  it("never draws the travelling-pulse when its apex and tip coincide (zero-length bearing)", () => {
    const { container } = render(
      <SystemEntitiesLayer
        entities={[
          {
            ...TRAVELLING_PULSE,
            shape: {
              kind: "travelling-pulse",
              to: TRAVELLING_PULSE.position,
              segmentLengthMetres: 100_000,
            },
          },
        ]}
        ctx={CTX}
      />,
    );
    expect(
      container.querySelector('[data-entity-id="cme-pulse-1"]'),
    ).toBeNull();
  });

  it("does not make a point interactive without onEntityActivate", () => {
    render(<SystemEntitiesLayer entities={[POINT]} ctx={CTX} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("fires onEntityActivate on click and on Enter/Space", () => {
    const onEntityActivate = vi.fn();
    render(
      <SystemEntitiesLayer
        entities={[POINT]}
        ctx={CTX}
        onEntityActivate={onEntityActivate}
      />,
    );
    const button = screen.getByRole("button", { name: /Kerbal X/ });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onEntityActivate).toHaveBeenCalledTimes(3);
    expect(onEntityActivate).toHaveBeenCalledWith("vessel-1");
  });

  it("reflects selectedId as aria-pressed on the matching point", () => {
    const { rerender } = render(
      <SystemEntitiesLayer
        entities={[POINT]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId={null}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(
      <SystemEntitiesLayer
        entities={[POINT]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId="vessel-1"
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("gives the interactive point marker a visible :focus-visible ring", () => {
    const { container } = render(
      <SystemEntitiesLayer
        entities={[POINT]}
        ctx={CTX}
        onEntityActivate={() => {}}
      />,
    );
    const marker = container.querySelector('[data-entity-id="vessel-1"]');
    expect(marker).not.toBeNull();

    // The ring itself: hidden by default, only shown by the CSS below.
    const focusRing = marker?.querySelector("circle.focus-ring");
    expect(focusRing).not.toBeNull();

    // styled-components injects the actual rules into <style> tags in
    // jsdom; confirm the marker's own generated class carries a
    // `:focus-visible` rule that reveals `.focus-ring`, and that the base
    // rule doesn't just strip the outline without this replacement (the
    // bug this test guards against).
    const css = Array.from(document.querySelectorAll("style"))
      .map((el) => el.textContent ?? "")
      .join("\n");
    const markerClass = Array.from(marker?.classList ?? []).find((cls) =>
      css.includes(`.${cls}`),
    );
    expect(markerClass).toBeDefined();
    expect(css).toContain(`.${markerClass}:focus-visible .focus-ring`);
    expect(css).toMatch(/outline:\s*none/);
  });

  it("does not add a focus ring or make a non-interactive point focusable", () => {
    const { container } = render(
      <SystemEntitiesLayer entities={[POINT]} ctx={CTX} />,
    );
    const marker = container.querySelector('[data-entity-id="vessel-1"]');
    expect(marker?.querySelector("circle.focus-ring")).toBeNull();
    expect(marker).not.toHaveAttribute("tabIndex");
  });

  it("has no axe violations with an interactive point marker rendered", async () => {
    const { container } = render(
      <SystemEntitiesLayer
        entities={[POINT, RING, LINK, BLOB, TRAVELLING_PULSE]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId="vessel-1"
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("does not make an orbit-path with no vesselId interactive, even with onEntityActivate", () => {
    render(
      <SystemEntitiesLayer
        entities={[RING]}
        ctx={CTX}
        onEntityActivate={() => {}}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("makes a vessel's orbit-path ring (vesselId set) interactive: fires onEntityActivate on click and Enter/Space", () => {
    const onEntityActivate = vi.fn();
    render(
      <SystemEntitiesLayer
        entities={[VESSEL_RING]}
        ctx={CTX}
        onEntityActivate={onEntityActivate}
      />,
    );
    const button = screen.getByRole("button", { name: /Comsat Relay-1/ });
    fireEvent.click(button);
    fireEvent.keyDown(button, { key: "Enter" });
    fireEvent.keyDown(button, { key: " " });
    expect(onEntityActivate).toHaveBeenCalledTimes(3);
    expect(onEntityActivate).toHaveBeenCalledWith("vessel-orbit:v-relay");
  });

  it("draws the interactive vessel ring's dot as a non-interactive sibling, outside the clickable marker", () => {
    const { container } = render(
      <SystemEntitiesLayer
        entities={[VESSEL_RING]}
        ctx={CTX}
        onEntityActivate={() => {}}
      />,
    );
    const dot = container.querySelector(
      'circle[data-entity-dot-id="vessel-orbit:v-relay"]',
    );
    expect(dot).not.toBeNull();
    expect(dot).toHaveAttribute("pointer-events", "none");
    // Not nested inside the button-role marker: a decoration, not a second
    // hit target riding the same rotated frame as the ring's own geometry.
    const button = screen.getByRole("button", { name: /Comsat Relay-1/ });
    expect(button.contains(dot)).toBe(false);
  });

  it("reflects selectedId as aria-pressed on the matching vessel orbit-path ring", () => {
    const { rerender } = render(
      <SystemEntitiesLayer
        entities={[VESSEL_RING]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId={null}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    rerender(
      <SystemEntitiesLayer
        entities={[VESSEL_RING]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId="vessel-orbit:v-relay"
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("has no axe violations with an interactive vessel orbit-path ring rendered", async () => {
    const { container } = render(
      <SystemEntitiesLayer
        entities={[VESSEL_RING, LINK, BLOB]}
        ctx={CTX}
        onEntityActivate={() => {}}
        selectedId="vessel-orbit:v-relay"
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  describe("pulses", () => {
    it("renders nothing extra with no pending traffic (omitted or empty)", () => {
      const { container: withoutProp } = render(
        <SystemEntitiesLayer entities={[LINK]} ctx={CTX} />,
      );
      expect(withoutProp.querySelectorAll("[data-pulse-edge-id]")).toHaveLength(
        0,
      );

      const { container: withEmpty } = render(
        <SystemEntitiesLayer entities={[LINK]} ctx={CTX} pulses={[]} />,
      );
      expect(withEmpty.querySelectorAll("[data-pulse-edge-id]")).toHaveLength(
        0,
      );
    });

    it("draws a pulse as a line along its edge's already-projected endpoints, not a marker at a single point", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[{ id: "cmd-1", edgeId: "link-1", t: 0.5, opacity: 0.75 }]}
        />,
      );
      // LINK projects to x1=0, x2=2 (see the "connection-line" test above):
      // the pulse rides the SAME endpoints, it never re-derives a position.
      const pulse = container.querySelector('[data-pulse-edge-id="link-1"]');
      expect(pulse?.tagName).toBe("line");
      expect(pulse?.getAttribute("x1")).toBe("0");
      expect(pulse?.getAttribute("x2")).toBe("2");
      expect(pulse?.getAttribute("y1")).toBe("0");
      expect(pulse?.getAttribute("y2")).toBe("0");
    });

    it("gives the pulse a gradient stroke whose bright stop sits at t and carries the pulse's own opacity", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[{ id: "cmd-1", edgeId: "link-1", t: 0.5, opacity: 0.75 }]}
        />,
      );
      const pulse = container.querySelector('[data-pulse-edge-id="link-1"]');
      const stroke = pulse?.getAttribute("stroke") ?? "";
      const gradientId = stroke.match(/url\(#([^)]+)\)/)?.[1];
      expect(gradientId).toBeDefined();
      const gradient = container.querySelector(`#${gradientId}`);
      expect(gradient?.tagName).toBe("linearGradient");
      // Gradient coordinate space matches the edge's own endpoints, so the
      // bright band travels ALONG the line rather than across it.
      expect(gradient?.getAttribute("x1")).toBe("0");
      expect(gradient?.getAttribute("x2")).toBe("2");
      const stops = gradient?.querySelectorAll("stop") ?? [];
      expect(stops).toHaveLength(3);
      const peak = stops[1];
      expect(peak.getAttribute("offset")).toBe("0.5");
      expect(peak.getAttribute("stop-opacity")).toBe("0.75");
      // The band's two ends fade to transparent: a travelling glow, not a
      // solid bright line end to end.
      expect(stops[0].getAttribute("stop-opacity")).toBe("0");
      expect(stops[2].getAttribute("stop-opacity")).toBe("0");
    });

    it("never draws a circle marker for a pulse (the old vessel-like language)", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[{ id: "cmd-1", edgeId: "link-1", t: 0.5, opacity: 1 }]}
        />,
      );
      expect(
        container.querySelector('circle[data-pulse-edge-id="link-1"]'),
      ).toBeNull();
    });

    it("silently skips a pulse whose edgeId matches no resolved connection-line", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[{ id: "cmd-1", edgeId: "no-such-edge", t: 0.5, opacity: 1 }]}
        />,
      );
      expect(container.querySelectorAll("[data-pulse-edge-id]")).toHaveLength(
        0,
      );
    });

    it("renders one marker per pulse when several share the same edge", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[
            { id: "cmd-1", edgeId: "link-1", t: 0.2, opacity: 1 },
            { id: "cmd-2", edgeId: "link-1", t: 0.8, opacity: 0.5 },
          ]}
        />,
      );
      expect(
        container.querySelectorAll('[data-pulse-edge-id="link-1"]'),
      ).toHaveLength(2);
    });

    it("pulse markers are never interactive (pointer-events: none, no role)", () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[LINK]}
          ctx={CTX}
          pulses={[{ id: "cmd-1", edgeId: "link-1", t: 0.5, opacity: 1 }]}
        />,
      );
      const pulse = container.querySelector('[data-pulse-edge-id="link-1"]');
      expect(pulse).toHaveAttribute("pointer-events", "none");
      expect(pulse).not.toHaveAttribute("role");
    });

    it("has no axe violations with pulses rendered alongside an interactive marker", async () => {
      const { container } = render(
        <SystemEntitiesLayer
          entities={[VESSEL_RING, LINK]}
          ctx={CTX}
          onEntityActivate={() => {}}
          pulses={[{ id: "cmd-1", edgeId: "link-1", t: 0.5, opacity: 1 }]}
        />,
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
