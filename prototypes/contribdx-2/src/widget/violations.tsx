// Widget-author and mirror-author mistakes, pinned by @ts-expect-error.

import { useContributedFilters } from "../core/contributedFilters";
import { useContributions } from "../core/contributionsRuntime";
import type { ResourceOpsUnit, SlotOf } from "../sdk";

// 1. A qualified slot key must keep the kind as its suffix, so the composed
//    id's second segment still names its kind. "process" alone is rejected.
export function BadQualifier() {
  const filters = useContributedFilters<ResourceOpsUnit>({
    // @ts-expect-error `as` must match `${string}-filters`
    as: "process",
  });
  return <output>{filters.activeCount}</output>;
}

// 2. The sdk mirror line cannot name an unregistered kind: SlotOf's first
//    parameter is constrained to the declared kind union.
// @ts-expect-error "filterz" is not a declared slot kind
export type BadMirrorLine = SlotOf<"filterz", ResourceOpsUnit, "isru.drills">;

// 3. The host-side read is registry-constrained (existing behaviour, kept):
//    a typo'd id in useContributions is a compile error with a suggestion.
export function BadHostRead() {
  // @ts-expect-error "resource-ops.filterz" is not a declared slot
  const entries = useContributions("resource-ops.filterz");
  return <output>{entries.length}</output>;
}
