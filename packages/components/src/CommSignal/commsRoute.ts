import type { CommsHop } from "@ksp-gonogo/sitrep-sdk";

/** One labelled stop along the vessel-to-command-centre chain. */
export interface CommsRouteNode {
  label: string;
  /** Hover text: what kind of node this is, for the title attribute. */
  title: string;
}

/**
 * Builds the display chain for a `comms.path` hop list: the active vessel
 * (always "You", `comms.path` is always the reader's OWN path, never
 * another vessel's), each intermediate relay (the hop's own raw node name),
 * and the resolved command centre (`centreLabel`, the same name the panel
 * subtitle already uses, not the hop's own opaque "home" id).
 *
 * `hops` is ordered vessel-to-centre (`CommNetBackend.Path`/`RaCommsBackend`
 * in `mod/`), so node `i+1` is hop `i`'s `to`: an N-hop path always yields
 * N+1 nodes. Empty hops (no path home) yields an empty chain, the caller's
 * cue to render nothing.
 */
export function buildCommsRouteNodes(
  hops: readonly CommsHop[],
  centreLabel: string,
): CommsRouteNode[] {
  if (hops.length === 0) return [];
  const nodes: CommsRouteNode[] = [{ label: "You", title: "Your vessel" }];
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
