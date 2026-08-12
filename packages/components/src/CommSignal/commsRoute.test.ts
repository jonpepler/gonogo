import type { CommsHop } from "@ksp-gonogo/sitrep-sdk";
import { describe, expect, it } from "vitest";
import { buildCommsRouteNodes, commsRouteRelayCount } from "./commsRoute";

function hop(from: string, to: string): CommsHop {
  return { from, to, kind: 0 };
}

describe("buildCommsRouteNodes", () => {
  it("returns an empty chain for an empty hop list (no path home)", () => {
    expect(buildCommsRouteNodes([], "Active Vessel", "KSC")).toEqual([]);
  });

  it("labels the source node by the vessel's own name, not 'You'", () => {
    const nodes = buildCommsRouteNodes(
      [hop("Active Vessel", "home")],
      "Active Vessel",
      "KSC",
    );
    expect(nodes.map((n) => n.label)).toEqual(["Active Vessel", "KSC"]);
  });

  it("names each intermediate relay by its own raw hop id, not the centre label", () => {
    const nodes = buildCommsRouteNodes(
      [hop("Active Vessel", "Relay Sat 1"), hop("Relay Sat 1", "home")],
      "Active Vessel",
      "KSC",
    );
    expect(nodes.map((n) => n.label)).toEqual([
      "Active Vessel",
      "Relay Sat 1",
      "KSC",
    ]);
  });

  it("uses the centre label for the terminal node even when the centre is a crewed vessel", () => {
    const nodes = buildCommsRouteNodes(
      [hop("Active Vessel", "Constant Companion")],
      "Active Vessel",
      "Constant Companion",
    );
    expect(nodes.map((n) => n.label)).toEqual([
      "Active Vessel",
      "Constant Companion",
    ]);
  });
});

describe("commsRouteRelayCount", () => {
  it("is 0 for a direct (1-hop) link", () => {
    expect(commsRouteRelayCount([hop("Active Vessel", "home")])).toBe(0);
  });

  it("is 1 for a single-relay (2-hop) path", () => {
    expect(
      commsRouteRelayCount([
        hop("Active Vessel", "Relay Sat 1"),
        hop("Relay Sat 1", "home"),
      ]),
    ).toBe(1);
  });

  it("is 0 for an empty (no-path-home) hop list", () => {
    expect(commsRouteRelayCount([])).toBe(0);
  });
});
