// ---------------------------------------------------------------------------
// VARIANT B from the contributor's side: subject-keyed slots.
//
// Read against `positives.ts` / `negatives.ts` this is the whole comparison. The
// slot id has no segment the compiler cannot check, so a bare literal is enough
// and `componentSlot(...)` is only sugar; there is no manifest to consult, no
// codegen to run, and the typo class of bug is gone rather than deferred to the
// runtime.
// ---------------------------------------------------------------------------

import type {
  ComponentSlotId,
  EntryForKey,
  FilterEntry,
  ResourceOpsUnit,
} from "@ksp-gonogo/sitrep-sdk";
import {
  componentSlot,
  ISRU_UNIT,
  inWidget,
  registerContribution,
  VESSEL_PART,
} from "@ksp-gonogo/sitrep-sdk";
import { SubjectFilter } from "@ksp-gonogo/ui-kit";

// --- the whole of the happy path -------------------------------------------
//
// A bare literal, fully checked. `item` is `ResourceOpsUnit` because the subject
// half of the key says so.

registerContribution({
  id: "kerbalism:isru-process",
  contributes: "subject-filter.isru-unit",
  compute: () => [
    {
      id: "running",
      label: "Running",
      group: "process",
      groupLabel: "Process",
      predicate: (item) => item.kind === "converter",
    },
  ],
});

// The same slot addressed through the component and the subject token, for a
// contributor that would rather name things than spell an id.
registerContribution({
  id: "kerbalism:isru-resource",
  contributes: componentSlot(SubjectFilter, ISRU_UNIT),
  compute: () => [
    {
      id: "ore",
      label: "Ore",
      predicate: (item) =>
        item.kind === "drill" ? item.drill.resource === "Ore" : false,
    },
  ],
});

registerContribution({
  id: "kerbalism:parts",
  contributes: componentSlot(SubjectFilter, VESSEL_PART),
  compute: () => [
    {
      id: "hab",
      label: "Habitats",
      predicate: (part) => part.partId.startsWith("hab-"),
    },
  ],
});

// --- the middle ground: narrow to one widget when broad would be wrong ------

registerContribution({
  id: "kerbalism:isru-console-only",
  contributes: inWidget("subject-filter.isru-unit", "isru-console"),
  compute: () => [
    {
      id: "verbose",
      label: "Idle converters",
      // Still fully typed: narrowing changes who sees the facet, not its shape.
      predicate: (item) => item.kind === "converter",
    },
  ],
});

// --- negatives --------------------------------------------------------------

// @ts-expect-error `isruconsole` is not a registered widget id
inWidget("subject-filter.isru-unit", "isruconsole");

// @ts-expect-error narrowing a slot that does not exist is still an error
inWidget("subject-filter.crew-member", "isru-console");

registerContribution({
  id: "bad:no-such-subject",
  // @ts-expect-error there is no `crew-member` subject
  contributes: "subject-filter.crew-member",
  compute: () => [],
});

registerContribution({
  id: "bad:no-such-component",
  // @ts-expect-error there is no `sparkline` slot component
  contributes: "sparkline.isru-unit",
  compute: () => [],
});

registerContribution({
  id: "bad:wrong-subject-shape",
  contributes: "subject-filter.vessel-part",
  compute: () => [
    {
      id: "x",
      label: "X",
      // @ts-expect-error ShipMapPart has no `kind`
      predicate: (part) => part.kind === "drill",
    },
  ],
});

// @ts-expect-error a subject token is required, a bare string is not one
componentSlot(SubjectFilter, "isru-unit");

// --- what the compiler knows ------------------------------------------------

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

/** The entry type still resolves to the component's shape at the subject. */
export type _EntryResolves = Expect<
  Eq<EntryForKey<"subject-filter.isru-unit">, FilterEntry<ResourceOpsUnit>>
>;

/**
 * And the decisive property: the SET of slot ids is finite and known, with no
 * free segment anywhere. Under variant A the equivalent union could only be
 * produced by generating a manifest from a render.
 */
export type _SlotIdsAreFullyEnumerated = Expect<
  Eq<
    ComponentSlotId,
    | "filter.isru-unit"
    | "filter.vessel-part"
    | "meter.isru-unit"
    | "meter.vessel-part"
    | "subject-filter.isru-unit"
    | "subject-filter.vessel-part"
  >
>;
