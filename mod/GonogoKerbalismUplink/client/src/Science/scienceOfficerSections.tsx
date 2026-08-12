import {
  registerAugment,
  type SlotProps,
  useTelemetry,
} from "@ksp-gonogo/sitrep-sdk";
import {
  Badge,
  Cluster,
  ReadoutCaption,
  type Severity,
  Unit,
} from "@ksp-gonogo/ui-kit";
import { readKerbalismScienceInstrumentExt } from "../science";
import { KERBALISM } from "../uplink";

// ---------------------------------------------------------------------------
// ScienceOfficer's `science-officer.sections` per-instrument slot: the fill-in
// the base widget's own doc comment has anticipated since the science backend
// election landed (ScienceOfficer/index.tsx's `ScienceOfficerInstrumentSlotContext`
// doc comment names this augment directly). The base row already hides the
// stock Deploy/Transmit verbs for an enriched entry (`Instrument.enriched`,
// driven by the raw wire entry carrying a provider extension bag); this is
// where the honest replacement lands: WHY the experiment isn't producing
// (Kerbalism's own free-text `issue`, the collapsed form of its 62-condition
// requirement system), its running state, its continuous data rate, and
// whether it is a file-producing or sample-producing instrument.
//
// Reads `science.instruments` itself and joins on `instrument.partId` rather
// than the slot growing a second data-fetch prop: the same "the row passes
// identity, the augment pulls its own data" split ScienceOfficer's doc
// comment already describes for this slot.
// ---------------------------------------------------------------------------

type SectionsProps = SlotProps<"science-officer.sections">;

/** Kerbalism's derived display state (`ExpStatus`) → the row's severity scale. Decorative (no colour) for the two ordinary resting states. */
const EXP_STATUS_SEVERITY: Record<string, Severity | undefined> = {
  Running: "nominal",
  Forced: "nominal",
  Waiting: undefined,
  Stopped: undefined,
  Issue: "warning",
  Broken: "critical",
};

function findInstrumentEntry(
  raw: unknown,
  partId: string,
): Record<string, unknown> | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.find(
    (e): e is Record<string, unknown> =>
      !!e &&
      typeof e === "object" &&
      !Array.isArray(e) &&
      String((e as Record<string, unknown>).partId) === partId,
  );
}

function ScienceOfficerInstrumentDetail({ instrument }: SectionsProps) {
  const raw = useTelemetry("science.instruments");
  const entry = findInstrumentEntry(raw, instrument.partId);
  // biome-ignore lint/suspicious/noExplicitAny: readKerbalismScienceInstrumentExt narrows a generic wire entry shape, not this loosely-typed lookup result
  const ext = readKerbalismScienceInstrumentExt(entry as any);
  if (!ext) return null;

  // Null/undefined (not 0/false) means "takes no physical material": a
  // file-producing instrument. A defined mass (including 0, depleted)
  // means sample-producing. Loose check: the wire can carry either absence
  // spelling (JSON `null` or an omitted key), and both mean the same thing.
  const kind = ext.remainingSampleMass != null ? "sample" : "file";
  const producingRate =
    ext.dataRateMBps && ext.dataRateMBps.magnitude > 0
      ? ext.dataRateMBps
      : null;

  return (
    <Cluster
      gap="xs"
      wrap
      align="center"
      role="status"
      aria-live="polite"
      aria-label={`${instrument.partTitle} Kerbalism state`}
    >
      {ext.expStatus && (
        <Badge size="sm" severity={EXP_STATUS_SEVERITY[ext.expStatus]}>
          {ext.expStatus.toUpperCase()}
        </Badge>
      )}
      <Badge size="sm">{kind === "sample" ? "SAMPLE" : "FILE"}</Badge>
      {producingRate && (
        <ReadoutCaption>
          <Unit value={producingRate} decimals={3} />
        </ReadoutCaption>
      )}
      {kind === "sample" && ext.remainingSampleMass && (
        <ReadoutCaption>
          <Unit value={ext.remainingSampleMass} decimals={3} /> left
        </ReadoutCaption>
      )}
      {ext.issue && (
        <ReadoutCaption title={ext.issue}>{ext.issue}</ReadoutCaption>
      )}
    </Cluster>
  );
}

registerAugment({
  id: "science-officer-kerbalism-instrument-detail",
  augments: "science-officer.sections",
  component: ScienceOfficerInstrumentDetail,
  requires: "kerbalism",
  owner: KERBALISM,
});

export { ScienceOfficerInstrumentDetail };
