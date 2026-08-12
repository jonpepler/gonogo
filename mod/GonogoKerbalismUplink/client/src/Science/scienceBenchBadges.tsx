import {
  registerAugment,
  type SlotProps,
  useTelemetry,
} from "@ksp-gonogo/sitrep-sdk";
import { ReadoutCaption } from "@ksp-gonogo/ui-kit";
import { readKerbalismScienceExperimentExt } from "../science";
import { KERBALISM } from "../uplink";

// ---------------------------------------------------------------------------
// ScienceBench's `science-bench.badges` header slot: the same vessel-wide
// drive summary ScienceOfficer's `science-officer.badges` shows, next to
// this widget's own panel title instead. Kept as its own augment rather than
// sharing a component with ScienceOfficer's: the two widgets read the slot
// context differently (ScienceBench passes the parsed breakdown list;
// ScienceOfficer passes the instrument list) and each already reads
// `science.experiments` itself, so there is no shared state to factor out,
// only a shared LOOK, which the two independently produce from the same kit
// primitives.
// ---------------------------------------------------------------------------

type BadgesProps = SlotProps<"science-bench.badges">;

function ScienceBenchDriveBadges(_props: BadgesProps) {
  const experimentsRaw = useTelemetry("science.experiments");

  if (!Array.isArray(experimentsRaw) || experimentsRaw.length === 0) {
    return null;
  }

  let files = 0;
  let samples = 0;
  let transmitting = 0;
  let anyKerbalism = false;

  for (const entry of experimentsRaw) {
    // biome-ignore lint/suspicious/noExplicitAny: narrowing a generic wire array entry, not the reader's own return type
    const ext = readKerbalismScienceExperimentExt(entry as any);
    if (!ext) continue;
    anyKerbalism = true;
    if (ext.kind === "sample") samples++;
    else if (ext.kind === "file") files++;
    if (ext.transmitting) transmitting++;
  }

  if (!anyKerbalism) return null;

  // One caption, hand-joined: see ScienceOfficerDriveBadges's own comment on
  // why `panelAside` (a small chip-sized slot) gets a single joined string
  // rather than a row of independently gapped elements.
  const parts = [
    `${files} file${files === 1 ? "" : "s"} · ${samples} sample${samples === 1 ? "" : "s"}`,
  ];
  if (transmitting > 0) {
    parts.push(`TX ${transmitting} file${transmitting === 1 ? "" : "s"}`);
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
  id: "science-bench-kerbalism-drive-badges",
  augments: "science-bench.badges",
  component: ScienceBenchDriveBadges,
  requires: "kerbalism",
  owner: KERBALISM,
});

export { ScienceBenchDriveBadges };
