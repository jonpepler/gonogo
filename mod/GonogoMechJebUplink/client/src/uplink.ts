/**
 * Uplink client identity. One declaration per client bundle: every widget
 * this package registers stamps this handle as `owner`, so the widget
 * picker's mod search tags (effectiveSearchTags) derive "mechjeb"
 * automatically instead of relying on a per-widget field someone has to
 * remember to set.
 */
import { defineUplinkClient } from "@ksp-gonogo/sitrep-sdk";

// TODO(version): a future build step injects this from gonogo-uplink.json.
const UPLINK_VERSION = "0.0.0-dev";

export const MECHJEB = defineUplinkClient({
  id: "mechjeb",
  version: UPLINK_VERSION,
  name: "MechJeb",
});
