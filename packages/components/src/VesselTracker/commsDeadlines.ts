import type {
  FleetVesselSilence,
  SilenceDeadlineBasis,
} from "@ksp-gonogo/sitrep-client";
import { formatDuration } from "@ksp-gonogo/ui-kit";
import type { VesselTrackerDeadlineEntry } from "./deadlines";

// ---------------------------------------------------------------------------
// The COMMS half of the tracker's deadline slot: the geometric return and the
// declaration deadline, derived from one craft's silence reckoning.
//
// Pure and exported so a test can drive it from a plain `FleetVesselSilence`
// without a stream, a Processor or the contribution registry, the same shape
// `computeVesselStatus` takes in SystemView.
// ---------------------------------------------------------------------------

/** Wire basis id -> the words an operator reads. */
const DEADLINE_BASIS: Record<SilenceDeadlineBasis, string> = {
  "orbital-period": "orbital-period fallback",
  "policy-floor": "policy floor",
  "policy-ceiling": "policy ceiling",
  "no-orbit": "no orbit to propagate",
  destroyed: "vessel destroyed",
  "predicted-reacquisition": "grace on the predicted reacquisition",
  "no-occultation": "no occultation found",
  "no-emergence-in-window": "no emergence found in the search window",
  "warp-limited": "search cut short by warp",
  "grace-exceeds-ceiling": "grace exceeded the policy ceiling",
};

/**
 * The subset of bases that explain a MISSING prediction rather than a present
 * one. When the geometric row has no UT, one of these says why, which is a far
 * better thing for the operator to read than a bare blank.
 */
const PREDICTION_ABSENCE: Partial<Record<SilenceDeadlineBasis, string>> = {
  "no-occultation": DEADLINE_BASIS["no-occultation"],
  "no-emergence-in-window": DEADLINE_BASIS["no-emergence-in-window"],
  "warp-limited": DEADLINE_BASIS["warp-limited"],
  "no-orbit": DEADLINE_BASIS["no-orbit"],
  destroyed: DEADLINE_BASIS.destroyed,
};

const IN_CONTACT = "in contact";

/**
 * The prediction's basis, with its error budget said out loud when there is
 * one. This is the spec's "confidence" section: "back at 14:32" and "back at
 * 14:32, and we would not call it late for another six minutes" are different
 * operational statements, and only the second one is checkable.
 *
 * Worded as a one-sided ALLOWANCE, never as "+/- 6 min". The budget is the
 * slack after the predicted moment before the silence stops being a late
 * reappearance; there is no matching term on the early side, and implying a
 * symmetric error bar would claim an uncertainty nothing computed. A real
 * two-sided one would have to come out of the visibility sweep itself.
 */
function predictionBasis(graceSeconds: number | null | undefined): string {
  if (graceSeconds == null || graceSeconds <= 0)
    return "predicted reacquisition";
  return `predicted reacquisition, allowing ${formatDuration(graceSeconds)} of slack`;
}

/**
 * The geometric and declaration entries for one craft. Always both, so the host
 * never has to guess whether comms simply had nothing to say about one of them:
 * an in-contact craft contributes two rows that say "in contact" rather than no
 * rows at all.
 */
export function commsDeadlineEntries(
  vesselId: string,
  silence: FleetVesselSilence,
): readonly VesselTrackerDeadlineEntry[] {
  const nominal = silence.state === "Nominal";

  const predicted = silence.predictedReacquisitionUt;
  const predictionAbsence = silence.deadlineBasis
    ? PREDICTION_ABSENCE[silence.deadlineBasis]
    : undefined;
  const geometric: VesselTrackerDeadlineEntry = {
    target: vesselId,
    kind: "geometric",
    label: "Radio path reopens",
    atUt: nominal ? null : (predicted ?? null),
    basis: nominal
      ? IN_CONTACT
      : predicted != null
        ? predictionBasis(silence.predictionGraceSeconds)
        : (predictionAbsence ?? "no prediction published"),
  };

  const deadlineUt = silence.deadlineUt ?? null;
  const declaration: VesselTrackerDeadlineEntry = {
    target: vesselId,
    kind: "declaration",
    label: "Counted as lost",
    atUt: nominal ? null : deadlineUt,
    basis: nominal
      ? IN_CONTACT
      : deadlineUt == null
        ? "no deadline set"
        : silence.deadlineBasis
          ? DEADLINE_BASIS[silence.deadlineBasis]
          : "basis not stated",
  };

  return [geometric, declaration];
}
