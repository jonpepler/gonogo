import { CORE_UPLINK_CLIENT } from "@ksp-gonogo/core";
import {
  type FleetSilenceRoster,
  type FleetVesselSilence,
  silenceByVessel,
} from "@ksp-gonogo/sitrep-client";
import { commsDeadlineEntries } from "./commsDeadlines";
import type { VesselTrackerDeadlineEntry } from "./deadlines";

// ---------------------------------------------------------------------------
// The comms-owned half of `vessel-tracker.deadline`, as a real contribution.
//
// This is the shape the spec asked for and the shape that was not expressible
// until `fleet.silence` existed. A contribution declares its dependencies
// STATICALLY at module load, so it can never name a per-guid topic like
// `silence.<guid>.state`; the per-vessel bridge that reaches those topics only
// holds vessels something is already subscribed to, which makes a fan-out over
// it circular. One fleet-wide topic breaks that: the Processor below derives
// the whole roster once per frame however many consumers pull on it, and this
// contribution fans out over every vessel in it, stamping each entry with the
// craft it is about. The host filters to whichever craft the operator picked,
// so the runtime choice lives at the consumer, where it belongs.
// ---------------------------------------------------------------------------

/**
 * Every tracked vessel's silence reckoning, keyed by vessel id, derived once
 * per frame no matter how many contributions and widgets read it.
 */
export const FLEET_SILENCE_BY_VESSEL = CORE_UPLINK_CLIENT.registerProcessor({
  id: "fleet-silence-by-vessel",
  deps: ["fleet.silence"] as const,
  compute: ([roster]) =>
    silenceByVessel(roster as FleetSilenceRoster | undefined),
});

/** The processor's value as a contribution or a widget receives it. */
export type FleetSilenceByVessel = ReadonlyMap<string, FleetVesselSilence>;

const COMMS_DEADLINE_CONTRIBUTION = {
  id: "vessel-tracker-comms-deadlines",
  contributes: "vessel-tracker.deadline" as const,
  deps: [FLEET_SILENCE_BY_VESSEL],
  compute: (topics: Record<string, unknown>) => {
    const byVessel = topics[FLEET_SILENCE_BY_VESSEL.id] as
      | FleetSilenceByVessel
      | undefined;
    if (!byVessel || byVessel.size === 0) return null;
    const entries: VesselTrackerDeadlineEntry[] = [];
    for (const [vesselId, silence] of byVessel) {
      entries.push(...commsDeadlineEntries(vesselId, silence));
    }
    return entries;
  },
};

/**
 * Registered at module load like every other built-in, and exported so a test
 * that clears the registry can put it back. Without that, `clearContributions()`
 * silently removes the built-in for the rest of the file and every assertion
 * about a contributed row passes against an empty slot.
 */
export function registerCommsDeadlineContribution(): void {
  CORE_UPLINK_CLIENT.registerContribution(COMMS_DEADLINE_CONTRIBUTION);
}

registerCommsDeadlineContribution();
