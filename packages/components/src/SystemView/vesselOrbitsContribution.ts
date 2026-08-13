import { CORE_UPLINK_CLIENT } from "@ksp-gonogo/core";
import {
  CommsHopKind,
  type CommsNetwork,
  RosterCommsControlSource,
  Situation,
  type SystemBodies,
  type SystemVessels,
  type VesselRosterEntry,
  VesselType,
} from "@ksp-gonogo/sitrep-sdk";
import { magnitudeOf, magnitudeOr } from "@ksp-gonogo/ui-kit";
import { edgeEntityId } from "./commsPath";
import type {
  SystemEntity,
  SystemEntityMeta,
  SystemEntityPosition,
} from "./systemEntities";

// ---------------------------------------------------------------------------
// The built-in `system-view.entities` contribution, single owner of both the
// fleet (Task 3) and the CommNet relay graph (Task 4): every vessel on
// `system.vessels` (the same roster FleetRoster reads) drawn as a faint
// orbit ring around its body, PLUS `comms.network`'s relay links drawn as
// faint connection lines between those same vessel positions. One reader for
// both, per the locked plan constraint: a graph node's `id` IS a vessel's
// `vesselId` (Task 1's `95e394bc`), so the graph and the vessel positions it
// joins against have to come off the same roster read to stay in sync frame
// to frame. Uses the SAME projection/colour primitives `systemEntities.ts`
// already built for the diagram's own bodies (Task 2).
//
// Vessel entities are deliberately UNFILTERED, unlike FleetRoster's
// `isRosterCraft`: the roster carries debris, asteroids/comets, planted
// flags, EVA kerbals, and deployed science hardware alongside real craft, and
// every one of them has a real orbit (or a real landed position) worth
// showing on the system diagram. FleetRoster's craft-only filter answers
// "what do I fly"; this contribution answers "what's actually out there", a
// different question with a wider answer.
//
// Includes the active/framed vessel too: this contribution has no notion of
// "active", it's static data computed from `system.vessels` alone. Excluding
// the active vessel's own entity from the render is host-side state (which
// vessel is framed), and belongs in `index.tsx`, which drops the entity whose
// `vesselId` matches `vessel.identity` before handing entities to
// `SystemEntitiesLayer`: `SystemDiagram` already draws that vessel's own
// bright ring, so a contributed faint one would sit duplicated on top of it.
// ---------------------------------------------------------------------------

function bodyNameByIndex(
  bodies: SystemBodies | undefined,
): Map<number, string> {
  const m = new Map<number, string>();
  for (const b of bodies?.bodies ?? []) {
    if (b.name != null) m.set(b.index, b.name);
  }
  return m;
}

function commsLabel(
  source: RosterCommsControlSource | null | undefined,
): string {
  switch (source) {
    case RosterCommsControlSource.Full:
      return "connected";
    case RosterCommsControlSource.Partial:
      return "relay";
    case RosterCommsControlSource.None:
      return "none";
    default:
      return "unknown";
  }
}

function crewLabel(v: VesselRosterEntry): string {
  const count = magnitudeOf(v.crewCount);
  const capacity = magnitudeOf(v.crewCapacity);
  if (count == null) return "unknown";
  return capacity != null ? `${count}/${capacity}` : String(count);
}

/** Roster fields carried for the future info panel (task-3-brief: name, type, situation, body, crew, comms). */
function metaFor(v: VesselRosterEntry, bodyName: string): SystemEntityMeta {
  return {
    name: v.name,
    type: VesselType[v.vesselType] ?? "Unknown",
    situation: Situation[v.situation] ?? "Unknown",
    body: bodyName,
    crew: crewLabel(v),
    comms: commsLabel(v.commsControlSource),
  };
}

/**
 * Whether `v.orbit` is usable: `sma` present, finite, positive. Shared by the
 * vessel-entity builder below and the CommNet graph's node-position join,
 * both need the identical "does this vessel have a real orbit" test.
 */
function hasUsableOrbit(v: VesselRosterEntry): boolean {
  const sma = magnitudeOf(v.orbit?.sma);
  return v.orbit != null && sma != null && sma > 0;
}

/**
 * A vessel's own position, in `bodyName`'s frame: the full Keplerian element
 * set when `v.orbit` is usable, else a faint-dot degrade AT the body
 * (`xMetres: 0, yMetres: 0`), honestly "this vessel is here" without
 * fabricating orbital elements it doesn't have. Shared by
 * `computeVesselOrbitEntities` (draws it) and `computeCommsNetworkEntities`
 * (joins a graph node's id to it, never redoing the projection choice).
 */
function vesselPosition(
  v: VesselRosterEntry,
  bodyName: string,
): SystemEntityPosition {
  if (!hasUsableOrbit(v)) {
    return { kind: "fixed", parentName: bodyName, xMetres: 0, yMetres: 0 };
  }
  return {
    kind: "orbit",
    parentName: bodyName,
    sma: magnitudeOf(v.orbit?.sma) as number,
    ecc: magnitudeOr(v.orbit?.ecc, 0),
    lan: magnitudeOr(v.orbit?.lan, 0),
    argPe: magnitudeOr(v.orbit?.argPe, 0),
    trueAnomaly: 0, // ignored by "orbit-path", which draws the whole ring
  };
}

/**
 * Pure core of the fleet half of the contribution, exported so a test can
 * call it directly against plain `SystemVessels`/`SystemBodies` fixtures
 * (mirrors `partMetersContribution.ts`'s own `computeBuiltinPartMeters`
 * pattern).
 *
 * A vessel with a usable orbit draws the full ring, faint, via
 * `orbitEllipseGeometry`/`projectOrbitRing` (same conic math and colour
 * rules a body's own orbit ring uses); one with no usable orbit but a
 * resolved body degrades to a faint dot at that body (`vesselPosition`
 * above). A vessel whose body can't be resolved at all (no `bodyIndex`, or an
 * index `system.bodies` hasn't caught up on) is omitted outright, the same
 * "no data" honesty.
 */
export function computeVesselOrbitEntities(
  vessels: SystemVessels | undefined,
  bodies: SystemBodies | undefined,
): readonly SystemEntity[] {
  if (!vessels) return [];
  const nameByIndex = bodyNameByIndex(bodies);
  const entities: SystemEntity[] = [];

  for (const v of vessels.vessels) {
    const bodyName =
      v.bodyIndex != null ? (nameByIndex.get(v.bodyIndex) ?? null) : null;
    if (bodyName == null) continue;

    entities.push({
      id: `vessel-orbit:${v.vesselId}`,
      vesselId: v.vesselId,
      position: vesselPosition(v, bodyName),
      shape: hasUsableOrbit(v)
        ? { kind: "orbit-path" }
        : { kind: "point", radiusPx: 3 },
      style: { emphasis: "faint" },
      meta: metaFor(v, bodyName),
    });
  }

  return entities;
}

/**
 * The home body's name, resolved off `BodyEntry.isHome` (whichever body KSC
 * and the launch sites sit on): the authoritative join, replacing the
 * fragile "body index 1 is home" FlightGlobals convention this contribution
 * used to assume (true for stock KSP and RSS, both index 1, but not
 * guaranteed under an arbitrary planet pack). `null` when no body has the
 * flag set yet (no sample landed, or an older mod build not yet emitting
 * it), the same "no data" honesty every other join in this file follows.
 */
function homeBodyName(bodies: SystemBodies | undefined): string | null {
  for (const b of bodies?.bodies ?? []) {
    if (b.isHome === true && b.name != null) return b.name;
  }
  return null;
}

/**
 * A CommNet graph node's projected position, joined the same way `Comms.cs`'s
 * `CommsNetworkNode.Id` doc promises: the home ground station resolves to
 * `homeName` (a faint dot at its centre, same "at the body" degrade a landed
 * vessel gets); every other node resolves by matching its id against a
 * vessel's `vesselId` and reusing `vesselPosition`. `null` when the join
 * can't be honestly completed (no body flagged `isHome` yet, or the id
 * matches no known vessel and isn't `"home"`), never a fabricated position.
 */
function resolveNodePosition(
  nodeId: string,
  isHomeNode: boolean,
  vesselsById: ReadonlyMap<string, VesselRosterEntry>,
  nameByIndex: ReadonlyMap<number, string>,
  homeName: string | null,
): SystemEntityPosition | null {
  if (isHomeNode) {
    return homeName
      ? { kind: "fixed", parentName: homeName, xMetres: 0, yMetres: 0 }
      : null;
  }
  const vessel = vesselsById.get(nodeId);
  if (!vessel) return null;
  const bodyName =
    vessel.bodyIndex != null
      ? (nameByIndex.get(vessel.bodyIndex) ?? null)
      : null;
  if (bodyName == null) return null;
  return vesselPosition(vessel, bodyName);
}

/**
 * Pure core of the CommNet-graph half of the contribution: one faint
 * `connection-line` entity per `comms.network` edge, endpoints joined via
 * `resolveNodePosition`. An edge referencing a node whose position can't be
 * honestly resolved (an id matching neither `"home"` nor any known vessel, a
 * vessel whose own body can't be resolved yet, or a home body missing from
 * `system.bodies`) is OMITTED outright rather than drawn from a fabricated or
 * partial position, mirroring `computeVesselOrbitEntities`'s own "no data"
 * discipline. Traffic direction/animation and the selected-path highlight are
 * later tasks (5, 8); this draws the static topology only, always faint.
 */
export function computeCommsNetworkEntities(
  network: CommsNetwork | undefined,
  vessels: SystemVessels | undefined,
  bodies: SystemBodies | undefined,
): readonly SystemEntity[] {
  if (!network) return [];
  const nameByIndex = bodyNameByIndex(bodies);
  const homeName = homeBodyName(bodies);
  const vesselsById = new Map(
    (vessels?.vessels ?? []).map((v) => [v.vesselId, v] as const),
  );
  // Task 1's contract: "home" is always the KSC id, whether or not this
  // frame's node list happens to carry a matching entry; `kind === Home` is
  // the belt-and-braces check for a differently-id'd home-role node.
  const homeNodeIds = new Set(
    network.nodes.filter((n) => n.kind === CommsHopKind.Home).map((n) => n.id),
  );
  homeNodeIds.add("home");

  const entities: SystemEntity[] = [];
  for (const edge of network.edges) {
    const from = resolveNodePosition(
      edge.a,
      homeNodeIds.has(edge.a),
      vesselsById,
      nameByIndex,
      homeName,
    );
    const to = resolveNodePosition(
      edge.b,
      homeNodeIds.has(edge.b),
      vesselsById,
      nameByIndex,
      homeName,
    );
    if (!from || !to) continue;

    entities.push({
      id: edgeEntityId(edge),
      position: from,
      shape: { kind: "connection-line", to },
      style: { emphasis: "faint" },
    });
  }
  return entities;
}

CORE_UPLINK_CLIENT.registerContribution({
  id: "system-view-vessel-orbits",
  contributes: "system-view.entities",
  deps: ["system.vessels", "system.bodies", "comms.network"],
  compute: (topics) => [
    ...computeVesselOrbitEntities(
      topics["system.vessels"],
      topics["system.bodies"],
    ),
    ...computeCommsNetworkEntities(
      topics["comms.network"],
      topics["system.vessels"],
      topics["system.bodies"],
    ),
  ],
});
