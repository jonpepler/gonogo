import type { TelemaachusSchema } from "@gonogo/core";

export interface MapViewConfig {
  /** Number of trajectory history points to keep. Default: 200. */
  trajectoryLength?: number;
  /** Telemachus keys selected for display in the telemetry panel. */
  telemetryKeys?: (keyof TelemaachusSchema)[];
}
