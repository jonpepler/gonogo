import { KERBALISM } from "../uplink";
import { CREW_SURVIVAL, type CrewSurvival } from "./processor";

// ---------------------------------------------------------------------------
// CrewStatus's `crew-status.row-tone` contribution (packages/components/src/
// CrewStatus/index.tsx, that slot's own doc comment): colours a kerbal's
// roster `Card` the moment they cross into the danger band, the SAME
// threshold `warningFor` (index.tsx, this folder) already uses to decide
// whether the name-level death-clock/critical-rule badge fires. Fed by the
// SAME `CREW_SURVIVAL` Processor the augment and panel badge both read, one
// per-frame derivation, three consumers now.
//
// CrewStatus itself never learns what "critical" means, it only receives a
// `ReadoutTone` string per kerbal name; this file is where "nogo tone ==
// alert" gets decided, same split the `.survival`/`.badges` augments already
// keep.
// ---------------------------------------------------------------------------

interface CrewRowToneEntry {
  crewName: string;
  tone: "alert";
}

/**
 * Pure core, exported so a test can call it directly against a plain
 * `CrewSurvival` fixture without going through the contribution registry at
 * all (mirrors `survivalBadges`, `badge.ts` next door).
 */
function rowTones(
  survival: CrewSurvival | undefined,
): CrewRowToneEntry[] | null {
  if (!survival) return null;
  const entries = survival.kerbals
    .filter((k) => k.tone === "nogo")
    .map((k) => ({ crewName: k.name, tone: "alert" as const }));
  return entries.length > 0 ? entries : null;
}

KERBALISM.registerContribution({
  id: "crew-survival-row-tone",
  contributes: "crew-status.row-tone",
  deps: [CREW_SURVIVAL],
  requires: "kerbalism",
  compute: (topics) =>
    rowTones(topics[CREW_SURVIVAL.id] as CrewSurvival | undefined),
});

export { rowTones };
