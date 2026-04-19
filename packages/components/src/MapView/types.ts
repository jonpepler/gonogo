export interface MapViewConfig {
  /** Number of trajectory history points to keep. Default: 200. */
  trajectoryLength?: number;
  /** Data keys selected for display in the telemetry panel. */
  telemetryKeys?: string[];
}
