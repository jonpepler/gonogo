import {
  CommsHopKind,
  type CommsNetwork,
  type CommsNetworkEdge,
} from "@ksp-gonogo/sitrep-sdk";

/**
 * Selection payoff (Task 5): the selected vessel's CommNet route to home,
 * derived by walking `comms.network`'s already-contributed graph (the same
 * topic `vesselOrbitsContribution.ts` reads to draw the faint relay lines,
 * Task 4). No per-vessel path ships on the wire, so this is a generic BFS
 * over `edges`, not a lookup: a graph node's `id` IS a vessel's `vesselId`
 * (Task 1's `95e394bc`), so the selected vessel IS a node to search from.
 *
 * `"full"`: a path exists using only `active: true` edges, the live control
 * route. `"partial"`: no all-active route exists, but the vessel still
 * reaches home through some mix of active/inactive edges (e.g. a relay hop
 * has dropped out of range this tick but the topology still connects).
 * `"none"`: the vessel is unreachable from home at all. The colour palette
 * (`COMMS_PATH_COLOUR`) collapses "partial"/"none" to the same degraded
 * tone, matching the roster's own Full/Partial/None `CommsControlSource`
 * three-tier semantics (`RosterCommsControlSource`, `vesselOrbitsContribution
 * .ts`'s `commsLabel`) at the two-tone granularity a highlighted line can
 * actually show.
 */
export type CommsPathQuality = "full" | "partial" | "none";

export interface DerivedCommsPath {
  quality: CommsPathQuality;
  /**
   * Entity ids of the `comms-edge:<a>:<b>` contribution entries that make up
   * the route, in traversal order. Empty when `quality` is `"none"`.
   */
  edgeIds: readonly string[];
}

export const NO_COMMS_PATH: DerivedCommsPath = {
  quality: "none",
  edgeIds: [],
};

/** Mirrors `vesselOrbitsContribution.ts`'s own home-node convention: `"home"`
 *  is always the KSC id, plus any node whose `kind` says so explicitly. */
function resolveHomeNodeIds(network: CommsNetwork): ReadonlySet<string> {
  const ids = new Set(
    network.nodes.filter((n) => n.kind === CommsHopKind.Home).map((n) => n.id),
  );
  ids.add("home");
  return ids;
}

/** The exact id `computeCommsNetworkEntities` (`vesselOrbitsContribution.ts`)
 *  assigns a `comms.network` edge's contributed `connection-line` entity. */
function edgeEntityId(edge: CommsNetworkEdge): string {
  return `comms-edge:${edge.a}:${edge.b}`;
}

/** Undirected adjacency: each edge reachable from both its endpoints,
 *  carrying the ORIGINAL edge object so a traversed hop reconstructs the
 *  same `edgeEntityId` the contribution used, regardless of walk direction. */
function buildAdjacency(
  edges: readonly CommsNetworkEdge[],
): Map<string, Array<{ to: string; edge: CommsNetworkEdge }>> {
  const adjacency = new Map<
    string,
    Array<{ to: string; edge: CommsNetworkEdge }>
  >();
  const link = (from: string, to: string, edge: CommsNetworkEdge) => {
    const hops = adjacency.get(from);
    if (hops) hops.push({ to, edge });
    else adjacency.set(from, [{ to, edge }]);
  };
  for (const edge of edges) {
    link(edge.a, edge.b, edge);
    link(edge.b, edge.a, edge);
  }
  return adjacency;
}

/**
 * BFS shortest hop-count path from `fromId` to any id in `targetIds`, over
 * `edges`. Returns the ordered edges the walk crossed, or `null` when no
 * target is reachable. `fromId` itself matching a target is the zero-hop
 * case (empty path, no edges to highlight).
 */
function shortestPathToAny(
  edges: readonly CommsNetworkEdge[],
  fromId: string,
  targetIds: ReadonlySet<string>,
): CommsNetworkEdge[] | null {
  if (targetIds.has(fromId)) return [];
  const adjacency = buildAdjacency(edges);
  const visited = new Set<string>([fromId]);
  const cameFrom = new Map<string, { from: string; edge: CommsNetworkEdge }>();
  const queue: string[] = [fromId];
  let reached: string | null = null;

  for (let head = 0; head < queue.length && reached === null; head++) {
    const current = queue[head];
    for (const { to, edge } of adjacency.get(current) ?? []) {
      if (visited.has(to)) continue;
      visited.add(to);
      cameFrom.set(to, { from: current, edge });
      if (targetIds.has(to)) {
        reached = to;
        break;
      }
      queue.push(to);
    }
  }
  if (reached === null) return null;

  const path: CommsNetworkEdge[] = [];
  let cursor = reached;
  while (cursor !== fromId) {
    const step = cameFrom.get(cursor);
    if (!step) return null; // unreachable: defensive, cameFrom is exhaustive for any visited node
    path.unshift(step.edge);
    cursor = step.from;
  }
  return path;
}

/**
 * Derives the selected vessel's route to home: an active-only walk first
 * (the live control path, `"full"`), falling back to a walk over every edge
 * regardless of `active` (`"partial"`, the topology still connects even
 * though the live route doesn't), and finally `NO_COMMS_PATH` when the
 * vessel isn't reachable from home at all.
 */
export function deriveCommsPath(
  network: CommsNetwork | undefined,
  vesselId: string,
): DerivedCommsPath {
  if (!network || vesselId.length === 0) return NO_COMMS_PATH;

  const homeNodeIds = resolveHomeNodeIds(network);

  const activeEdges = network.edges.filter((e) => e.active);
  const fullPath = shortestPathToAny(activeEdges, vesselId, homeNodeIds);
  if (fullPath) {
    return { quality: "full", edgeIds: fullPath.map(edgeEntityId) };
  }

  const anyPath = shortestPathToAny(network.edges, vesselId, homeNodeIds);
  if (anyPath) {
    return { quality: "partial", edgeIds: anyPath.map(edgeEntityId) };
  }

  return NO_COMMS_PATH;
}

/** GREEN for a full control path; both degraded tiers (partial/no path)
 *  share ONE degraded tone (the roster's own Full/Partial/None palette
 *  collapsed to what a single highlighted line can show, see this file's
 *  module doc comment). `"none"` is never actually painted (`edgeIds` is
 *  empty), kept here only so the map is total. */
export const COMMS_PATH_COLOUR: Readonly<Record<CommsPathQuality, string>> = {
  full: "var(--color-status-go-bg)",
  partial: "var(--color-status-warning-bg)",
  none: "var(--color-status-nogo-bg)",
};
