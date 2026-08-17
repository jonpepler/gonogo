import type {
  FleetVesselSilence,
  SilenceDeadlineBasis,
} from "@ksp-gonogo/sitrep-client";
import type { VesselTrackerDeadlineEntry } from "./deadlines";

// ---------------------------------------------------------------------------
// The COMMS half of the tracker's deadline slot: the geometric return and the
// declaration deadline, derived from one craft's silence reckoning.
//
// Pure and exported so a test can drive it from a plain `FleetVesselSilence`
// without a stream, a Processor or the contribution registry, the same shape
// `computeVesselStatus` takes in SystemView.
// ---------------------------------------------------------------------------

/**
 * Wire basis id -> the two or three words an operator reads.
 *
 * SHORT on purpose. The basis is what separates a real geometric prediction
 * from an orbital-period fallback, which is the spec's own example of something
 * the operator should never have to guess at, and the long prose forms
 * truncated at every panel width including the widest. A basis you have to hover
 * to finish reading is one you will not read.
 *
 * The long form is not lost: it goes in {@link DEADLINE_BASIS_LONG} and onto the
 * row's tooltip, so the short label is a summary rather than a replacement.
 */
const DEADLINE_BASIS: Record<SilenceDeadlineBasis, string> = {
  "orbital-period": "orbit period",
  "policy-floor": "floor",
  "policy-ceiling": "ceiling",
  "no-orbit": "no orbit",
  destroyed: "destroyed",
  "predicted-reacquisition": "predicted",
  "no-occultation": "nothing in the way",
  "no-emergence-in-window": "no emergence found",
  "warp-limited": "too fast to resolve",
  "grace-exceeds-ceiling": "too uncertain",
};

/**
 * `predicted-reacquisition` means two different things on the two rows, and one
 * word cannot serve both. On the GEOMETRIC row it is the prediction itself; on
 * the DECLARATION row it means the deadline was graced off that prediction
 * rather than falling back to an orbital period. Rendering both as "predicted"
 * loses exactly the distinction the spec calls out as the one an operator must
 * never have to guess at.
 */
const DECLARATION_BASIS: Partial<Record<SilenceDeadlineBasis, string>> = {
  "predicted-reacquisition": "prediction + grace",
};

/** The same ten, in full, for the tooltip. */
const DEADLINE_BASIS_LONG: Record<SilenceDeadlineBasis, string> = {
  "orbital-period": "orbital-period fallback",
  "policy-floor": "policy floor",
  "policy-ceiling": "policy ceiling",
  "no-orbit": "no orbit to propagate",
  destroyed: "vessel destroyed",
  "predicted-reacquisition": "grace on the predicted reacquisition",
  "no-occultation":
    "no occultation found, so geometry does not explain this silence",
  "no-emergence-in-window": "no emergence found in the search window",
  "warp-limited": "search cut short by warp",
  "grace-exceeds-ceiling":
    "grace exceeded the policy ceiling, so the deadline was withheld",
};

/**
 * The subset of bases that explain a MISSING prediction rather than a present
 * one. When the geometric row has no UT, one of these says why, which is a far
 * better thing for the operator to read than a bare blank.
 */
const PREDICTION_ABSENCE: readonly SilenceDeadlineBasis[] = [
  "no-occultation",
  "no-emergence-in-window",
  "warp-limited",
  "no-orbit",
  "destroyed",
];

function explainsMissingPrediction(
  basis: SilenceDeadlineBasis | null | undefined,
): basis is SilenceDeadlineBasis {
  return basis != null && PREDICTION_ABSENCE.includes(basis);
}

const IN_CONTACT = "in contact";

/**
 * The basis when there IS a prediction. The error budget behind it travels
 * separately, as `slackSeconds`, so the host can put it beside the value: it is
 * a different fact from how the UT was derived, and sharing this line pushed
 * both off the end of the row.
 *
 * That budget is one-sided. It is slack AFTER the predicted moment before the
 * silence stops being a late reappearance; there is no matching term on the
 * early side, so anything implying a symmetric error bar would claim an
 * uncertainty nothing computed. A real two-sided one would have to come out of
 * the visibility sweep itself.
 */
const PREDICTED = "predicted";

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
  const missingPrediction = explainsMissingPrediction(silence.deadlineBasis);
  const geometric: VesselTrackerDeadlineEntry = {
    target: vesselId,
    kind: "geometric",
    label: "Radio path reopens",
    atUt: nominal ? null : (predicted ?? null),
    basis: nominal
      ? IN_CONTACT
      : predicted != null
        ? PREDICTED
        : missingPrediction
          ? DEADLINE_BASIS[silence.deadlineBasis as SilenceDeadlineBasis]
          : "no prediction published",
    detail:
      nominal || predicted != null || !missingPrediction
        ? undefined
        : DEADLINE_BASIS_LONG[silence.deadlineBasis as SilenceDeadlineBasis],
    slackSeconds:
      !nominal && predicted != null && (silence.predictionGraceSeconds ?? 0) > 0
        ? (silence.predictionGraceSeconds as number)
        : undefined,
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
          ? (DECLARATION_BASIS[silence.deadlineBasis] ??
            DEADLINE_BASIS[silence.deadlineBasis])
          : "basis not stated",
    detail:
      nominal || deadlineUt == null || !silence.deadlineBasis
        ? undefined
        : DEADLINE_BASIS_LONG[silence.deadlineBasis],
  };

  return [geometric, declaration];
}
