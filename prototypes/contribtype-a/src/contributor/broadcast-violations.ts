// Broadcast targets are checked as tightly as slot ids.

import { registerBroadcastContribution } from "../sdk";

// 1. A component kind that does not exist.
registerBroadcastContribution({
  id: "bad/kind",
  // @ts-expect-error there is no "slider" component
  contributes: { kind: "slider", rows: "ResourceOpsUnit" },
  compute: () => [],
});

// 2. A row type nobody registered.
registerBroadcastContribution({
  id: "bad/rows",
  // @ts-expect-error no such row type name
  contributes: { kind: "filter", rows: "ResourceOpsUnits" },
  compute: () => [],
});

// 3. The predicate typed against the wrong rows for the named row type.
registerBroadcastContribution({
  id: "bad/broadcast-row-mismatch",
  contributes: { kind: "filter", rows: "ResourceOpsUnit" },
  compute: () => [
    {
      id: "crewed",
      label: "Crewed",
      // @ts-expect-error ResourceOpsUnit has no `crew`
      predicate: (unit) => unit.crew > 0,
    },
  ],
});

// 4. A meter's entry broadcast at filters.
registerBroadcastContribution({
  id: "bad/broadcast-kind-entry",
  contributes: { kind: "filter", rows: "ResourceOpsUnit" },
  compute: (_topics, emit) => {
    // @ts-expect-error that is a MeterEntry
    emit({ partId: "p", resource: "Ore", amount: 1, capacity: 2 });
  },
});
