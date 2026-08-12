import type { CommsHop } from "@ksp-gonogo/sitrep-sdk";

/** One labelled stop along the vessel-to-command-centre chain. */
export interface CommsRouteNode {
  label: string;
  /** Hover text: what kind of node this is, for the title attribute. */
  title: string;
}

/**
 * Builds the display chain for a `comms.path` hop list: the active vessel
 * (`vesselLabel`, its own name, `comms.path` is always the reader's OWN
 * path, never another vessel's), each intermediate relay (the hop's own raw
 * node name), and the resolved command centre (`centreLabel`, the same name
 * the panel subtitle already uses, not the hop's own opaque "home" id).
 * Gonogo is the experience FROM the command centre, so the vessel is named
 * rather than addressed as "you", the centre is the implicit reader.
 *
 * `hops` is ordered vessel-to-centre (`CommNetBackend.Path`/`RaCommsBackend`
 * in `mod/`), so node `i+1` is hop `i`'s `to`: an N-hop path always yields
 * N+1 nodes. Empty hops (no path home) yields an empty chain, the caller's
 * cue to render nothing.
 */
export function buildCommsRouteNodes(
  hops: readonly CommsHop[],
  vesselLabel: string,
  centreLabel: string,
): CommsRouteNode[] {
  if (hops.length === 0) return [];
  const nodes: CommsRouteNode[] = [
    { label: vesselLabel, title: "Source vessel" },
  ];
  for (let i = 0; i < hops.length - 1; i++) {
    nodes.push({ label: hops[i].to, title: "Relay" });
  }
  nodes.push({ label: centreLabel, title: "Command centre" });
  return nodes;
}

/**
 * Relay nodes between the vessel and the command centre: hop count minus
 * one (a 1-hop path is a direct link with no relay in between). Position-
 * based rather than counting `CommsHopKind.Relay` hops, because a crewed-
 * vessel command centre (comms-command-centre-experiment) never sets a
 * hop's `Kind` to `Home`, so kind-counting would over-count by one whenever
 * the centre itself isn't a ground station.
 */
export function commsRouteRelayCount(hops: readonly CommsHop[]): number {
  return Math.max(0, hops.length - 1);
}

/**
 * `SignalDelay.cs`'s own constant, mirrored here as the client-side fallback
 * for a leg with no path-wide delay to apportion against (see
 * `commsLegTimeSeconds` below).
 */
const SPEED_OF_LIGHT_METERS_PER_SECOND = 299_792_458;

/**
 * One leg's light-time, seconds. `comms.path` carries each hop's distance
 * but no per-hop delay (the contract has no such field), so this derives it
 * rather than reading it off the wire.
 *
 * When the path's total one-way delay is known, the hop's share is
 * apportioned by distance against the route's total distance:
 * `hopMeters * (pathDelaySeconds / totalMeters)`. That reproduces
 * `SignalDelay.cs`'s own `OneWaySeconds = totalMeters / (c *
 * LightSpeedScale)` math exactly, so every leg's time sums to the total
 * DELAY row above the route, whatever `LightSpeedScale` the save is
 * running, without this widget ever needing to know that scale factor.
 *
 * Falls back to real-world light-time (`distance / c`) when there's no
 * total delay to apportion against yet (`comms.delay` hasn't arrived this
 * tick) or no hop in the path carries a distance at all. Returns
 * `undefined` when this hop itself has no distance to derive from.
 */
export function commsLegTimeSeconds(
  hop: CommsHop,
  hops: readonly CommsHop[],
  pathDelaySeconds: number | null | undefined,
): number | undefined {
  const hopMeters = hop.distanceMeters?.magnitude;
  if (hopMeters === undefined) return undefined;
  const totalMeters = hops.reduce(
    (sum, h) => sum + (h.distanceMeters?.magnitude ?? 0),
    0,
  );
  if (
    typeof pathDelaySeconds === "number" &&
    pathDelaySeconds > 0 &&
    totalMeters > 0
  ) {
    return hopMeters * (pathDelaySeconds / totalMeters);
  }
  return hopMeters / SPEED_OF_LIGHT_METERS_PER_SECOND;
}
