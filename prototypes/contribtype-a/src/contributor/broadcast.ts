// ---------------------------------------------------------------------------
// The operator's "accept a slot for ANY widget" idea, as far as it can go
// without giving up types.
//
// This contributor names no widget and no instance. It says "every filter over
// ResourceOps rows, wherever one is mounted", and it reaches both of
// ResourceOps' filters, plus any filter over those rows in a widget written
// after this file. Its predicate is still typed against the real row union,
// because the target names the ROWS even though it does not name the widget.
//
// What it cannot do is address one instance: a facet that only makes sense on
// the process axis lands on the resource axis too. That is why this is the
// broadcast form and not the only form.
// ---------------------------------------------------------------------------

import { registerBroadcastContribution } from "../sdk";

registerBroadcastContribution({
  id: "kerbalism/any-resource-ops-filter",
  contributes: { kind: "filter", rows: "ResourceOpsUnit" },
  compute: () => [
    {
      id: "deployed",
      label: "Deployed",
      predicate: (unit) => unit.kind === "drill",
    },
  ],
});
