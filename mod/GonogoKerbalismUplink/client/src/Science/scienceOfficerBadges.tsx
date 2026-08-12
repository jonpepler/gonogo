import {
  registerAugment,
  type SlotProps,
  useTelemetry,
} from "@ksp-gonogo/sitrep-sdk";
import { ReadoutCaption } from "@ksp-gonogo/ui-kit";
import {
  readKerbalismScienceExperimentExt,
  readKerbalismScienceLabExt,
} from "../science";
import { KERBALISM } from "../uplink";

// ---------------------------------------------------------------------------
// ScienceOfficer's `science-officer.badges` header slot: a vessel-wide
// Kerbalism summary beside the panel title, the header-level counterpart to
// `scienceOfficerSections.tsx`'s per-instrument detail. Reads
// `science.experiments` (Kerbalism's one-row-per-stored-result shape, see
// `KerbalismScienceMap.Experiments`) for drive/file/transmit figures and
// `science.lab` for the aggregate analysis rate, independently of the
// instrument list the slot's own context carries: the badges answer "how are
// the DRIVES doing", a question the instrument list alone can't.
// ---------------------------------------------------------------------------

type BadgesProps = SlotProps<"science-officer.badges">;

function ScienceOfficerDriveBadges(_props: BadgesProps) {
  const experimentsRaw = useTelemetry("science.experiments");
  const labRaw = useTelemetry("science.lab");

  if (!Array.isArray(experimentsRaw) || experimentsRaw.length === 0) {
    return null;
  }

  let files = 0;
  let samples = 0;
  let transmitting = 0;
  let storageCapacityMB: number | undefined;
  let storageUsedMB: number | undefined;
  let anyKerbalism = false;

  for (const entry of experimentsRaw) {
    // biome-ignore lint/suspicious/noExplicitAny: narrowing a generic wire array entry, not the reader's own return type
    const ext = readKerbalismScienceExperimentExt(entry as any);
    if (!ext) continue;
    anyKerbalism = true;
    if (ext.kind === "sample") samples++;
    else if (ext.kind === "file") files++;
    if (ext.transmitting) transmitting++;
    // Drive capacity/used repeat per stored result on that drive; take the
    // first reading rather than summing (summing would multiply one drive's
    // capacity by how many files happen to sit on it).
    if (storageCapacityMB === undefined && ext.storageCapacityMB) {
      storageCapacityMB = ext.storageCapacityMB.magnitude;
    }
    if (storageUsedMB === undefined && ext.storageUsedMB) {
      storageUsedMB = ext.storageUsedMB.magnitude;
    }
  }

  if (!anyKerbalism) return null;

  let analysisRateMBps = 0;
  if (Array.isArray(labRaw)) {
    for (const entry of labRaw) {
      // biome-ignore lint/suspicious/noExplicitAny: narrowing a generic wire array entry, not the reader's own return type
      const ext = readKerbalismScienceLabExt(entry as any);
      if (ext?.effectiveRateMBps)
        analysisRateMBps += ext.effectiveRateMBps.magnitude;
    }
  }

  // One caption, hand-joined with " · " rather than a row of separately
  // gapped elements: `panelAside` is a small chip-sized slot (see Panel's
  // own doc comment), not a multi-item cluster, so several independently
  // laid-out children run together with no visible gap between them at
  // panel width. Matches ScienceBench's own header-meta line convention.
  const parts = [
    `${files} file${files === 1 ? "" : "s"} · ${samples} sample${samples === 1 ? "" : "s"}`,
  ];
  if (storageCapacityMB !== undefined && storageUsedMB !== undefined) {
    parts.push(
      `Drive ${storageUsedMB.toFixed(0)}/${storageCapacityMB.toFixed(0)} MB`,
    );
  }
  if (transmitting > 0) {
    parts.push(`TX ${transmitting} file${transmitting === 1 ? "" : "s"}`);
  }
  if (analysisRateMBps > 0) {
    parts.push(`Lab ${analysisRateMBps.toFixed(4)} MB/s`);
  }

  return (
    <ReadoutCaption
      role="status"
      aria-live="polite"
      aria-label="Kerbalism drive summary"
    >
      {parts.join(" · ")}
    </ReadoutCaption>
  );
}

registerAugment({
  id: "science-officer-kerbalism-drive-badges",
  augments: "science-officer.badges",
  component: ScienceOfficerDriveBadges,
  requires: "kerbalism",
  owner: KERBALISM,
});

export { ScienceOfficerDriveBadges };
