// The row type is CANONICALLY the sdk's (`mod/sitrep-sdk/src/api/
// contribution-slots.ts`), where it sits behind the `ContributionRows`
// seam so facade-sealed contributors resolve the same type this widget
// filters. Re-exported here so widget-adjacent code keeps its short import;
// there is no local copy to drift.
export type { ResourceOpsUnit } from "@ksp-gonogo/sitrep-sdk";
