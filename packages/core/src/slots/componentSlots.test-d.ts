// The DERIVED component-led registry, checked as a mechanism (not a per-slot
// ratchet: there are no per-slot declarations anywhere to ratchet against,
// which is the point). `filters.ResourceOpsUnit` is used as the exemplar
// because it is the shipping slot; the assertions are about what the
// `SlotSegmentEntries` x `ContributionRows` derivation does with ANY id.

import type { FilterEntry, ResourceOpsUnit } from "@ksp-gonogo/sitrep-sdk";
import type {
  ContributionEntry,
  ContributionSlotId,
  ContributionTopics,
} from "../contributions";

type Assignable<A, B> = A extends B ? true : false;
type Expect<T extends true> = T;

// A derived slot resolves the component's entry type over the named rows,
// both directions, with no registry line behind it.
type _Entry = Expect<
  Assignable<
    ContributionEntry<"filters.ResourceOpsUnit">,
    FilterEntry<ResourceOpsUnit>
  >
>;
type _EntryBack = Expect<
  Assignable<
    FilterEntry<ResourceOpsUnit>,
    ContributionEntry<"filters.ResourceOpsUnit">
  >
>;

// Derived ids are members of the slot-id literal union, so typed positions
// (`ContributionEntry<S>`, `contributionSlots`) get TS2820's did-you-mean.
type _Id = Expect<Assignable<"filters.ResourceOpsUnit", ContributionSlotId>>;

// `ContributionRowTopics` feeds the typed head of a compute's argument.
type _Topics = Expect<
  Assignable<
    ContributionTopics<"filters.ResourceOpsUnit">["isru.drills"],
    unknown
  >
>;

// An id over an undeclared rows name falls back to the loose record (the
// out-of-repo posture), never to `never`.
type _UnknownRows = Expect<
  Assignable<ContributionEntry<"filters.Nope">, Record<string, unknown>>
>;
type _UnknownRowsNotNever = Expect<
  Assignable<{ anything: 1 }, ContributionEntry<"filters.Nope">>
>;

export type _ComponentSlotDerivation = [
  _Entry,
  _EntryBack,
  _Id,
  _Topics,
  _UnknownRows,
  _UnknownRowsNotNever,
];
