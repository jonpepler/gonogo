export interface MapViewConfig {
  /** Number of trajectory history points to keep. Default: 200. */
  trajectoryLength?: number;
  /** Data keys selected for display in the telemetry panel. */
  telemetryKeys?: string[];
  /**
   * Render the predicted ground track from `o.orbitPatches`. Default: true.
   * When false, prediction is never computed — saves the work entirely.
   */
  showPrediction?: boolean;
  /**
   * Render the fog-of-war satellite imaging overlay. Default: true. When
   * enabled, the ship reveals areas of the map as it orbits within the body's
   * imaging altitude window.
   */
  showFogOfWar?: boolean;
}
