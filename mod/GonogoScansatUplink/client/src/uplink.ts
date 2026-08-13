// Uplink client identity. One declaration per client bundle: every
// widget/augment this package registers stamps this handle as `owner`, so
// the widget picker's mod search tags (effectiveSearchTags) derive
// "scansat" automatically instead of relying on a per-widget field someone
// has to remember to set.
import { defineUplinkClient } from "@ksp-gonogo/sitrep-sdk";

// TODO(version): build-injects this from gonogo-uplink.json.
const UPLINK_VERSION = "0.0.0-dev";

export const SCANSAT = defineUplinkClient({
  id: "scansat",
  version: UPLINK_VERSION,
  name: "SCANsat",
});
