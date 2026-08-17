import type {
  FleetVesselSilence,
  SilenceDeadlineBasis,
} from "@ksp-gonogo/sitrep-client";

// ---------------------------------------------------------------------------
// Three kinds of deadline, never merged (vessel-tracker spec).
//
// All three are durations, which is exactly why collapsing them into one
// countdown lies invisibly: "4h" is true of whichever one it came from and
// wrong about the other two. So the model returns all three, always, in a
// fixed order, each carrying its own label, its own owner, and its own basis.
// An absent one says why it is absent rather than dropping out, because two
// rows read as the complete set.
//
// Nothing here decides anything. A row is a UT and the words describing where
// it came from; whether their ORDER is a problem is the operator's call.
// ---------------------------------------------------------------------------

export type DeadlineKind = "geometric" | "operational" | "declaration";

/** Whose model produces the number, shown so no row is anonymous. */
export type DeadlineOwner = "comms" | "life support" | "silence tracker";

export interface TrackerDeadline {
  kind: DeadlineKind;
  /** What runs out. Fixed per kind, except operational, which names the resource. */
  label: string;
  /** The question this row answers, so the three never read as restatements. */
  question: string;
  owner: DeadlineOwner;
  /** UT it falls at, or null when nothing supplies one. Never a substituted "now". */
  atUt: number | null;
  /** How the UT was arrived at, or why there isn't one. Always stated in words. */
  basis: string;
}

/**
 * An operational limit contributed by a life-support / power Uplink, one entry
 * per resource. The host takes the earliest as the operational deadline and
 * shows which resource it was, so "4 h" is never anonymous.
 *
 * `target` is the vessel it is about: a contribution's `compute` may see many
 * vessels and the host filters to the one being tracked, the same stamping
 * SystemView's `system-view.vessel-status` entries use.
 */
export interface VesselTrackerDeadlineEntry {
  target: string;
  /** The resource that runs out, e.g. "Life support", "Power". */
  label: string;
  /** UT it runs out at. Null is a withheld estimate, never an exhausted one. */
  atUt: number | null;
  /** How the contributor arrived at it, e.g. "oxygen at current draw". */
  basis: string;
}

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

const NO_MODEL = "no silence model";
const IN_CONTACT = "in contact";

function geometric(silence: FleetVesselSilence | undefined): TrackerDeadline {
  const row = {
    kind: "geometric",
    label: "Radio path reopens",
    question: "when will we be able to hear it",
    owner: "comms",
  } as const;

  if (!silence) return { ...row, atUt: null, basis: NO_MODEL };
  if (silence.state === "Nominal")
    return { ...row, atUt: null, basis: IN_CONTACT };

  const predicted = silence.predictedReacquisitionUt;
  if (predicted != null)
    return { ...row, atUt: predicted, basis: "predicted reacquisition" };

  const why = silence.deadlineBasis
    ? PREDICTION_ABSENCE[silence.deadlineBasis]
    : undefined;
  return { ...row, atUt: null, basis: why ?? "no prediction published" };
}

function operational(
  entries: readonly VesselTrackerDeadlineEntry[],
): TrackerDeadline {
  const row = {
    kind: "operational",
    question: "how long can it keep going",
    owner: "life support",
  } as const;

  // A withheld estimate is dropped, not read as zero: a contributor with
  // nothing to say must not become the earliest limit.
  const dated = entries.filter(
    (e): e is VesselTrackerDeadlineEntry & { atUt: number } => e.atUt != null,
  );
  if (dated.length === 0)
    return { ...row, label: "Consumables", atUt: null, basis: "not modelled" };

  const soonest = dated.reduce((a, b) => (b.atUt < a.atUt ? b : a));
  return {
    ...row,
    label: soonest.label,
    atUt: soonest.atUt,
    basis: soonest.basis,
  };
}

function declaration(silence: FleetVesselSilence | undefined): TrackerDeadline {
  const row = {
    kind: "declaration",
    label: "Counted as lost",
    question: "when does the game stop counting it as in contact",
    owner: "silence tracker",
  } as const;

  if (!silence) return { ...row, atUt: null, basis: NO_MODEL };
  if (silence.state === "Nominal")
    return { ...row, atUt: null, basis: IN_CONTACT };

  const at = silence.deadlineUt ?? null;
  const basis = silence.deadlineBasis
    ? DEADLINE_BASIS[silence.deadlineBasis]
    : "basis not stated";
  return { ...row, atUt: at, basis: at == null ? "no deadline set" : basis };
}

/**
 * The three deadlines for one vessel, always all three, always in this order.
 * Pure: takes the silence reckoning off the wire and whatever operational
 * limits were contributed, returns rows a renderer formats. No clock, so a
 * test can assert the UTs without pinning one.
 */
export function trackerDeadlines(
  silence: FleetVesselSilence | undefined,
  operationalEntries: readonly VesselTrackerDeadlineEntry[],
): readonly [TrackerDeadline, TrackerDeadline, TrackerDeadline] {
  return [
    geometric(silence),
    operational(operationalEntries),
    declaration(silence),
  ];
}
