import { type CommsHop, value } from "@ksp-gonogo/sitrep-sdk";
import { describe, expect, it } from "vitest";
import {
  buildCommsRouteNodes,
  commsLegTimeSeconds,
  commsRouteRelayCount,
} from "./commsRoute";

function hop(from: string, to: string): CommsHop {
  return { from, to, kind: 0 };
}

function hopWithDistance(from: string, to: string, meters: number): CommsHop {
  return { from, to, kind: 0, distanceMeters: value("m", meters) };
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

describe("commsLegTimeSeconds", () => {
  it("apportions the path's total delay across legs by distance", () => {
    const hops = [
      hopWithDistance("Active Vessel", "Relay Sat 1", 1_250_000),
      hopWithDistance("Relay Sat 1", "Relay Sat 2", 2_400_000),
      hopWithDistance("Relay Sat 2", "home", 640_000),
    ];
    const totalMeters = 1_250_000 + 2_400_000 + 640_000;
    const totalDelay = 6.2;

    const legTimes = hops.map((h) => commsLegTimeSeconds(h, hops, totalDelay));

    expect(legTimes[0]).toBeCloseTo((1_250_000 / totalMeters) * totalDelay, 9);
    expect(legTimes[1]).toBeCloseTo((2_400_000 / totalMeters) * totalDelay, 9);
    expect(legTimes[2]).toBeCloseTo((640_000 / totalMeters) * totalDelay, 9);
    // The apportioned legs always sum back to the total DELAY row above them.
    expect(
      (legTimes[0] ?? 0) + (legTimes[1] ?? 0) + (legTimes[2] ?? 0),
    ).toBeCloseTo(totalDelay, 9);
  });

  it("falls back to real light-time (distance / c) with no path delay to apportion against", () => {
    const hops = [hopWithDistance("Active Vessel", "home", 299_792_458)];
    expect(commsLegTimeSeconds(hops[0], hops, undefined)).toBeCloseTo(1, 9);
    expect(commsLegTimeSeconds(hops[0], hops, null)).toBeCloseTo(1, 9);
  });

  it("returns undefined for a hop with no distance to derive from", () => {
    const hops = [hop("Active Vessel", "home")];
    expect(commsLegTimeSeconds(hops[0], hops, 6.2)).toBeUndefined();
  });

  it("falls back to light-time when the total delay is non-positive", () => {
    const hops = [hopWithDistance("Active Vessel", "home", 299_792_458)];
    expect(commsLegTimeSeconds(hops[0], hops, 0)).toBeCloseTo(1, 9);
    expect(commsLegTimeSeconds(hops[0], hops, -3)).toBeCloseTo(1, 9);
  });
});
