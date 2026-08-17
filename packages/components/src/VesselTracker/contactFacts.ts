import type {
  FleetVesselContact,
  FleetVesselSilence,
} from "@ksp-gonogo/sitrep-client";

/**
 * The OBSERVED half of the contact section: what the game reported, with no
 * model's opinion mixed in. The reckoned half (predictions, deadlines) is
 * `trackerDeadlines`, deliberately a separate call so a renderer cannot blur
 * the two.
 *
 * Every field is nullable and every null means "not known", never zero. "Never
 * heard from" and "heard from 0 s ago" are different statements about a craft.
 */
export interface ContactFacts {
  /** Whether contact was observed on the most recent capture tick. Null when the topic has not delivered. */
  connected: boolean | null;
  /** UT of the last sample that observed contact. Null before the first-ever contact. */
  lastContactUt: number | null;
  /** Seconds since that sample, at the view clock. Null when there is no sample to measure from. */
  sinceLastContact: number | null;
  /** Seconds the tracker's current silence run has lasted. Null when it is not reckoning one. */
  silenceElapsed: number | null;
}

/**
 * The view clock runs behind the wire by the configured signal delay, so a
 * sample stamped ahead of it is ordinary rather than a fault. Clamping at zero
 * keeps that from surfacing as a negative age.
 */
function elapsedSince(
  atUt: number | null | undefined,
  nowUt: number,
): number | null {
  if (atUt == null) return null;
  return Math.max(0, nowUt - atUt);
}

export function contactFacts(
  contact: FleetVesselContact | undefined,
  silence: FleetVesselSilence | undefined,
  nowUt: number,
): ContactFacts {
  return {
    connected: contact?.connected ?? null,
    lastContactUt: contact?.lastContactUt ?? null,
    sinceLastContact: elapsedSince(contact?.lastContactUt, nowUt),
    // Measured from the tracker's own silence start, never from last contact:
    // contact can drop some way before the tracker opens a run, and reporting
    // the wider gap would overstate the silence the deadline is reckoned
    // against.
    silenceElapsed:
      silence && silence.state !== "Nominal"
        ? elapsedSince(silence.silenceSinceUt, nowUt)
        : null,
  };
}
