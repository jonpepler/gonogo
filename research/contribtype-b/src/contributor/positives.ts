// ---------------------------------------------------------------------------
// A facade-sealed contributor: a separate package whose only routes into gonogo
// are `@ksp-gonogo/sitrep-sdk` and `@ksp-gonogo/ui-kit`. It is typechecked by
// `tsconfig.contributor.json`, whose `paths` expose exactly those two, so an
// import of anything app-side does not resolve at all.
//
// Everything in this file must COMPILE. The things that must not are in
// `negatives.ts`.
// ---------------------------------------------------------------------------

import type {
  EntryForKey,
  EntryForTarget,
  FilterEntry,
  KeyOfTarget,
  MeterEntry,
} from "@ksp-gonogo/sitrep-sdk";
import {
  type ResourceOpsUnit,
  registerContribution,
  type ShipMapPart,
  slot,
} from "@ksp-gonogo/sitrep-sdk";
import { Filter, MeterList } from "@ksp-gonogo/ui-kit";

// --- Mode B: a sealed slot, addressed as a bare literal --------------------
//
// The compiler knows this slot EXISTS (it is in the generated manifest) and
// knows its entry type (Filter's shape, at ResourceOps's subject). `item` below
// is typed `ResourceOpsUnit` with nothing said about it here.

registerContribution({
  id: "kerbalism:resource-ops-process",
  contributes: "resource-ops.filter.process",
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

// The subject really is the widget's own row union, so a narrowing that only
// makes sense for ResourceOpsUnit typechecks.
registerContribution({
  id: "kerbalism:resource-ops-resource",
  contributes: "resource-ops.filter.resource",
  compute: () => [
    {
      id: "ore",
      label: "Ore",
      predicate: (item) =>
        item.kind === "drill" ? item.drill.resource === "Ore" : false,
    },
  ],
});

// A different component in a different widget: a MeterEntry at ShipMap's part.
registerContribution({
  id: "kerbalism:ship-map-supplies",
  contributes: "ship-map.meter.supplies",
  compute: () => [
    {
      id: "food",
      label: "Food",
      amount: 12,
      capacity: 40,
      belongsTo: (part) => part.partId.startsWith("hab-"),
    },
  ],
});

// --- Mode A: an unsealed slot, addressed through `slot(...)` ----------------
//
// No manifest entry needed. The component is named by importing it, which is
// also what brings its entry declaration into this program; the widget id is
// checked against the sdk's widget mirror; the instance name is the one part
// left to the runtime.

registerContribution({
  id: "kerbalism:resource-ops-unsealed",
  contributes: slot(Filter, "resource-ops", "process"),
  compute: () => [
    {
      id: "drills",
      label: "Drills",
      predicate: (item) => item.kind === "drill",
    },
  ],
});

registerContribution({
  id: "kerbalism:ship-map-unsealed",
  contributes: slot(MeterList, "ship-map", "supplies"),
  compute: () => [
    {
      id: "water",
      label: "Water",
      amount: 3,
      capacity: 10,
      belongsTo: (part) => part.title !== "",
    },
  ],
});

// --- what the compiler actually knows --------------------------------------

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

const processFilterSlot = slot(Filter, "resource-ops", "process");
type ProcessSlot = typeof processFilterSlot;

/** `slot(...)` composes a LITERAL key, not `string`: all three parts survive. */
export type _KeyIsLiteral = Expect<
  Eq<KeyOfTarget<ProcessSlot>, "resource-ops.filter.process">
>;

/** Both modes of addressing resolve to the same entry type. */
export type _ModesAgree = Expect<
  Eq<EntryForTarget<ProcessSlot>, EntryForKey<"resource-ops.filter.process">>
>;

export type _FilterEntryResolved = Expect<
  Eq<EntryForKey<"resource-ops.filter.process">, FilterEntry<ResourceOpsUnit>>
>;
export type _MeterEntryResolved = Expect<
  Eq<EntryForKey<"ship-map.meter.supplies">, MeterEntry<ShipMapPart>>
>;
