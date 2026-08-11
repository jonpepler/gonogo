// ---------------------------------------------------------------------------
// A contributor targeting an UPLINK'S widget rather than a first-party one.
// It imports the sdk for the mechanism, and the Uplink's own package for that
// Uplink's slot keys (a type-only dependency: the augmentation ships in the
// Uplink's `.d.ts`). Nothing about the mechanism changes.
// ---------------------------------------------------------------------------

import "../uplink/HabitatWidget";
import { registerContribution } from "../sdk";

registerContribution({
  id: "third-party/habitat-pressure-filters",
  contributes: "kerbalism-habitat.filter.pressure",
  compute: (topics) => {
    void topics["kerbalism.habitat"];
    return [
      {
        id: "pressurised",
        label: "Pressurised",
        // Typed as the Uplink's own HabitatUnit, resolved through the same
        // machinery with no first-party involvement.
        predicate: (unit) => unit.pressurised,
      },
    ];
  },
});

// The meter kind's entry shape is enforced just as tightly, and it is a
// completely different shape from the filter's.
registerContribution({
  id: "third-party/habitat-supplies",
  contributes: "kerbalism-habitat.meter.supplies",
  compute: () => [
    { partId: "hab-1", resource: "Food", amount: 12, capacity: 40 },
  ],
});

// The slot added a moment ago, with no augmentation edit behind it.
registerContribution({
  id: "third-party/habitat-waste",
  contributes: "kerbalism-habitat.filter.waste",
  compute: () => [
    { id: "full", label: "Full", predicate: (unit) => unit.crew > 0 },
  ],
});
