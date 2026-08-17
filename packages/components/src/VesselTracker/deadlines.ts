// ---------------------------------------------------------------------------
// Three kinds of deadline, never merged (vessel-tracker spec).
//
// All three are durations, which is exactly why collapsing them into one
// countdown lies invisibly: "4h" is true of whichever one it came from and
// wrong about the other two. So the host renders all three, always, in a fixed
// order, each carrying its own label, its own owner and its own basis. An
// absent one says why it is absent rather than dropping out, because two rows
// read as the complete set.
//
// Every row is CONTRIBUTED. Comms contributes the geometric return and the
// declaration deadline off the fleet-wide silence roster; a life-support Uplink
// contributes the operational limit; the host composes whatever arrived and
// fills the gaps with an honest absence. No contributor knows about any other,
// and the host knows about none of them.
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
 * One contributed deadline for one craft.
 *
 * `target` is the vessel it is about: a contribution fans out over every vessel
 * it can see and the host filters to the one being tracked, the same stamping
 * `system-view.vessel-status` uses. That fan-out is what lets a contribution
 * serve an operator-chosen subject at all, given that its dependencies are
 * declared statically at module load and can never name a runtime-picked one.
 */
export interface VesselTrackerDeadlineEntry {
  target: string;
  kind: DeadlineKind;
  /** The thing that runs out, e.g. "Radio path reopens", "Life support". */
  label: string;
  /** UT it runs out at. Null is a withheld estimate, never an exhausted one. */
  atUt: number | null;
  /** How the contributor arrived at it, or why there is no UT. */
  basis: string;
}

/** Host-owned per-kind framing, so a contributor supplies data and never chrome. */
const KIND: Record<
  DeadlineKind,
  { label: string; question: string; owner: DeadlineOwner; absent: string }
> = {
  geometric: {
    label: "Radio path reopens",
    question: "when will we be able to hear it",
    owner: "comms",
    absent: "no silence model",
  },
  operational: {
    label: "Operational limit",
    question: "how long can it keep going",
    owner: "life support",
    absent: "not modelled",
  },
  declaration: {
    label: "Counted as lost",
    question: "when does the game stop counting it as in contact",
    owner: "silence tracker",
    absent: "no silence model",
  },
};

const ORDER: readonly DeadlineKind[] = [
  "geometric",
  "operational",
  "declaration",
];

/**
 * The soonest contributed entry of a kind, ignoring the undated ones. A
 * contributor with nothing to say must not become the earliest limit, so a null
 * UT never wins; it is only used when it is all there is, and then only for its
 * words.
 */
function pick(
  entries: readonly VesselTrackerDeadlineEntry[],
): VesselTrackerDeadlineEntry | undefined {
  const dated = entries.filter(
    (e): e is VesselTrackerDeadlineEntry & { atUt: number } => e.atUt != null,
  );
  if (dated.length > 0) {
    return dated.reduce((a, b) => (b.atUt < a.atUt ? b : a));
  }
  return entries[0];
}

/**
 * The three deadlines for one vessel, always all three, always in this order.
 * Pure: takes whatever was contributed for this craft and returns rows a
 * renderer formats. No clock, so a test can assert the UTs without pinning one.
 */
export function trackerDeadlines(
  contributed: readonly VesselTrackerDeadlineEntry[],
): readonly [TrackerDeadline, TrackerDeadline, TrackerDeadline] {
  const rows = ORDER.map((kind) => {
    const framing = KIND[kind];
    const entry = pick(contributed.filter((e) => e.kind === kind));
    return {
      kind,
      label: entry?.label ?? framing.label,
      question: framing.question,
      owner: framing.owner,
      atUt: entry?.atUt ?? null,
      basis: entry?.basis ?? framing.absent,
    };
  });
  return rows as unknown as [TrackerDeadline, TrackerDeadline, TrackerDeadline];
}
