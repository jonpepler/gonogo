// ---------------------------------------------------------------------------
// Stands for `packages/core/src/contributions.ts`.
//
// THE ONE STRUCTURAL CHANGE to the existing file: core's registry EXTENDS the
// sdk's instead of being a disjoint second seam. Today a first-party slot is
// declared twice, once into core's registry (the widget's own
// `declare module "@ksp-gonogo/core"` block) and once into the sdk mirror,
// and only a conformance test keeps the two honest. With the extends, a slot
// declared once on the sdk is a member of core's `ContributionSlotId`
// automatically, so the widget-side block is DELETED, not moved.
//
// The widget-led layer is untouched: an app-internal slot that never needs a
// sealed contributor still merges into THIS interface from the widget's own
// file, exactly as today (see `../widget/ShipMapLite.tsx`).
// ---------------------------------------------------------------------------

import type { ContributionRegistry as SdkContributionRegistry } from "../sdk";

export interface ContributionRegistry extends SdkContributionRegistry {}

export type ContributionSlotId = keyof ContributionRegistry & string;

export type ContributionEntry<S extends string> =
  S extends keyof ContributionRegistry
    ? ContributionRegistry[S] extends { entry: infer E }
      ? E
      : Record<string, unknown>
    : Record<string, unknown>;

/** One rendered entry, tagged with provenance: mirrors the real `Contributed<E>`. */
export type Contributed<E> = E & { readonly contributionId: string };

// The contribution runtime itself is unchanged by this design; re-exported
// from the prototype's sdk module where it lives for sealing (see the note in
// `../sdk/types.ts`).
export {
  type AnyContribution,
  clearContributions,
  getContributionsForSlot,
  onContributionsChange,
  registerContribution,
} from "../sdk";
