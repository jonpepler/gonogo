// One row of ResourceOps' list. The type is authored on the sdk leaf
// (`mod/sitrep-sdk/src/api/contribution-slots.ts`, next to the
// `resource-ops.filters` slot declaration it feeds) because that is the one
// module a facade-sealed contributor can see; the widget consumes its own
// published contract from there rather than keeping a second copy.
export type { ResourceOpsUnit } from "@ksp-gonogo/sitrep-sdk";
