import {
  registerAugment,
  type SlotProps,
  useTelemetry,
  value,
} from "@ksp-gonogo/sitrep-sdk";
import { Badge, Cluster, ReadoutCaption, Unit } from "@ksp-gonogo/ui-kit";
import {
  readKerbalismScienceBreakdownExt,
  readKerbalismScienceExperimentExt,
} from "../science";
import { KERBALISM } from "../uplink";

// ---------------------------------------------------------------------------
// ScienceBench's `science-bench.aboard-row` per-subject slot: the file/sample
// detail the Aboard list's stock-shaped "N.N mits" line can't carry.
// Kerbalism's `science.experiments` is one row per STORED result (a subject
// can have several: a file being drained and, separately, a sample awaiting
// analysis), so this augment lists every result for the row's subjectId
// rather than picking one, plus the per-subject ledger
// (`science.experimentBreakdown`'s own bag) for how much of the subject has
// been collected across every run.
// ---------------------------------------------------------------------------

type AboardRowProps = SlotProps<"science-bench.aboard-row">;

function subjectIdOf(entry: unknown): string | undefined {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }
  const id = (entry as Record<string, unknown>).subjectId;
  return typeof id === "string" ? id : undefined;
}

function ScienceBenchAboardRowDetail({ subjectId }: AboardRowProps) {
  const experimentsRaw = useTelemetry("science.experiments");
  const breakdownRaw = useTelemetry("science.experimentBreakdown");

  const results = Array.isArray(experimentsRaw)
    ? experimentsRaw.filter((e) => subjectIdOf(e) === subjectId)
    : [];
  const breakdownEntry = Array.isArray(breakdownRaw)
    ? breakdownRaw.find((e) => subjectIdOf(e) === subjectId)
    : undefined;
  // biome-ignore lint/suspicious/noExplicitAny: narrowing a generic wire array entry, not the reader's own return type
  const ledger = readKerbalismScienceBreakdownExt(breakdownEntry as any);

  const resultChips = results
    // biome-ignore lint/suspicious/noExplicitAny: narrowing a generic wire array entry, not the reader's own return type
    .map((entry) => readKerbalismScienceExperimentExt(entry as any))
    .filter((ext): ext is NonNullable<typeof ext> => ext !== undefined);

  if (resultChips.length === 0 && !ledger) return null;

  return (
    <Cluster
      gap="xs"
      wrap
      align="center"
      role="status"
      aria-live="polite"
      aria-label="Kerbalism result detail"
    >
      {resultChips.map((ext, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: results carry no stable id on the wire (subjectId is shared across every chip in this row)
        <Cluster key={i} gap="xs" align="center">
          <Badge size="sm" severity={ext.transmitting ? "info" : undefined}>
            {ext.kind === "sample" ? "SAMPLE" : "FILE"}
          </Badge>
          {ext.dataSizeMB && (
            <ReadoutCaption>
              <Unit value={ext.dataSizeMB} decimals={1} />
            </ReadoutCaption>
          )}
          {ext.sciencePerMB && (
            <ReadoutCaption>
              <Unit value={ext.sciencePerMB} decimals={2} />
            </ReadoutCaption>
          )}
        </Cluster>
      ))}
      {ledger?.percentCollectedTotal && (
        <ReadoutCaption>
          <Unit
            value={value("%", ledger.percentCollectedTotal.magnitude * 100)}
            decimals={0}
          />{" "}
          collected
          {ledger.timesCompleted
            ? ` · ${ledger.timesCompleted.magnitude} run${
                ledger.timesCompleted.magnitude === 1 ? "" : "s"
              }`
            : ""}
        </ReadoutCaption>
      )}
    </Cluster>
  );
}

registerAugment({
  id: "science-bench-kerbalism-aboard-row",
  augments: "science-bench.aboard-row",
  component: ScienceBenchAboardRowDetail,
  requires: "kerbalism",
  owner: KERBALISM,
});

export { ScienceBenchAboardRowDetail };
