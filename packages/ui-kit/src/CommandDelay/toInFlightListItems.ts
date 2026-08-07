import type { InFlightListItem } from "./InFlightList";

/**
 * Structural subset of `sitrep-client`'s `InFlightCommand` that this mapping
 * reads. Declared here (not imported) so `@ksp-gonogo/ui-kit` stays the
 * vanilla design system with no dependency back on the telemetry spine: the
 * real `InFlightCommand` satisfies this shape structurally at every call site.
 */
export interface InFlightCommandLike {
  id: string;
  label: string;
  command: string;
  reachEtaSeconds: number | null;
  replyEtaSeconds: number | null;
  predictedPhase: InFlightListItem["phase"];
}

/** Anchor progress by phase when the eta geometry is missing (nulled on an
 * overdue/lost command, or a zero-delay edge), so the rail glow still sits
 * sensibly on the axis. */
const PHASE_PROGRESS: Record<InFlightListItem["phase"], number> = {
  "in-transit": 0.18,
  "awaiting-reply": 0.5,
  due: 0.62,
  overdue: 0.82,
  lost: 0.95,
};

/**
 * A command's TRUE progress along the 3-stage delay axis (0 = just sent, 1 =
 * end of the 3T span), from its reach/reply etas. The one-way delay is
 * `T = replyEta - reachEta` (holds even once `reachEta` has gone negative past
 * the reach point); elapsed since send is `T - reachEta`; the axis spans 3T. So
 * the rail glow tracks where the command actually is, moving smoothly across the
 * stages rather than snapping by phase. Falls back to a phase anchor when either
 * eta is absent.
 */
export function journeyProgress(item: InFlightCommandLike): number {
  const reach = item.reachEtaSeconds;
  const reply = item.replyEtaSeconds;
  if (reach !== null && reply !== null && reply > reach) {
    const t = reply - reach;
    const elapsed = t - reach;
    return Math.max(0, Math.min(1, elapsed / (3 * t)));
  }
  return PHASE_PROGRESS[item.predictedPhase];
}

/**
 * The single `InFlightCommand[] -> InFlightListItem[]` adapter every discrete
 * delayed-command widget shares (was copy-pasted verbatim into ActionGroup,
 * ManeuverPlanner, TargetPicker, RoboticsConsole, MechJeb, Navball,
 * ScienceOfficer, RotorTachometer). Which clock a row shows is phase-driven:
 * while `in-transit` the visible effect is the command REACHING the craft, so
 * it counts down to the reach eta; once it has arrived (any later phase) the
 * meaningful wait is the acknowledgement coming back, so it shows the reply
 * eta. `label` falls back to the raw command id when a dispatch carried none.
 * `progress` carries the true axis position for the rail glow (see
 * `journeyProgress`).
 */
export function toInFlightListItems(
  items: readonly InFlightCommandLike[],
): InFlightListItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label || item.command,
    etaSeconds:
      item.predictedPhase === "in-transit"
        ? item.reachEtaSeconds
        : item.replyEtaSeconds,
    phase: item.predictedPhase,
    progress: journeyProgress(item),
  }));
}
