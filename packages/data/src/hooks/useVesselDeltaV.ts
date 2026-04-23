import type { StageInfo } from "@gonogo/core";
import { useDataValue } from "@gonogo/core";
import { useMemo } from "react";

export interface VesselDeltaV {
  /** Total ΔV across all stages in vacuum (m/s). */
  totalVac: number;
  /** Total ΔV across all stages at sea level (m/s). */
  totalASL: number;
  /** Per-stage breakdown, in KSP's stage-number order (current stage last). */
  stages: readonly StageInfo[];
}

const EMPTY: VesselDeltaV = {
  totalVac: 0,
  totalASL: 0,
  stages: [],
};

/**
 * Whole-vessel ΔV summary derived from the `dv.stages` complex object.
 * One subscription, one re-render per broadcast — no per-stage fan-out.
 *
 * Consumers wanting "ΔV available from stage N onwards" can slice the
 * `stages` array themselves; we only expose totals because those are
 * what the maneuver planner's feasibility check needs out of the box.
 */
export function useVesselDeltaV(): VesselDeltaV {
  const stages = useDataValue("data", "dv.stages");
  return useMemo(() => {
    if (!Array.isArray(stages) || stages.length === 0) return EMPTY;
    let totalVac = 0;
    let totalASL = 0;
    for (const s of stages) {
      totalVac += s.deltaVVac;
      totalASL += s.deltaVASL;
    }
    return { totalVac, totalASL, stages };
  }, [stages]);
}
