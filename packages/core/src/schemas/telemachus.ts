/**
 * Type-level schema for the Telemachus Reborn data source.
 *
 * All known telemetry keys and their value types, based on the Telemachus
 * Reborn API. Key naming follows the API exactly.
 *
 * Third-party data sources follow the same pattern by augmenting
 * `DataSourceRegistry` via declaration merging in their own package:
 *
 *   declare module '@gonogo/core' {
 *     interface DataSourceRegistry {
 *       'my-source': MySourceSchema;
 *     }
 *   }
 */
export interface TelemaachusSchema {
  // --- v.* — Vessel ---

  // Position & altitude
  "v.altitude": number;
  "v.heightFromTerrain": number;
  "v.heightFromSurface": number;
  "v.terrainHeight": number;
  "v.lat": number;
  "v.long": number;

  // Velocity
  "v.surfaceSpeed": number;
  "v.verticalSpeed": number;
  "v.obtSpeed": number; // orbital speed (direct)
  "v.orbitalVelocity": number;
  "v.surfaceVelocity": number;
  "v.speed": number;
  "v.srfSpeed": number;

  // Forces & environment
  "v.geeForce": number;
  "v.geeForceImmediate": number;
  "v.mass": number;
  "v.mach": number;
  "v.dynamicPressure": number;
  "v.dynamicPressurekPa": number;
  "v.staticPressure": number;
  "v.atmosphericPressure": number;

  // Situation & state
  "v.name": string;
  "v.body": string;
  "v.situation": string;
  "v.situationString": string;
  "v.missionTime": number;
  "v.missionTimeString": string;
  "v.currentStage": number;
  "v.landed": boolean;
  "v.splashed": boolean;
  "v.landedAt": string;
  "v.isEVA": boolean;
  "v.angleToPrograde": number;

  // Action group state (read)
  "v.sasValue": boolean;
  "v.rcsValue": boolean;
  "v.lightValue": boolean;
  "v.brakeValue": boolean;
  "v.gearValue": boolean;
  "v.abortValue": boolean;
  "v.precisionControlValue": boolean;
  "v.ag1Value": boolean;
  "v.ag2Value": boolean;
  "v.ag3Value": boolean;
  "v.ag4Value": boolean;
  "v.ag5Value": boolean;
  "v.ag6Value": boolean;
  "v.ag7Value": boolean;
  "v.ag8Value": boolean;
  "v.ag9Value": boolean;
  "v.ag10Value": boolean;

  // --- n.* — Navigation ---
  "n.heading": number;
  "n.pitch": number;
  "n.roll": number;
  "n.rawheading": number;
  "n.rawpitch": number;
  "n.rawroll": number;
  "n.heading2": number;
  "n.pitch2": number;
  "n.roll2": number;

  // --- f.* — Flight control (read values) ---
  "f.throttle": number;

  // --- o.* — Orbit ---

  // Apsides
  "o.ApA": number;
  "o.PeA": number;
  "o.ApR": number;
  "o.PeR": number;
  "o.timeToAp": number;
  "o.timeToPe": number;

  // Keplerian elements
  "o.sma": number;
  "o.semiMinorAxis": number;
  "o.semiLatusRectum": number;
  "o.eccentricity": number;
  "o.inclination": number;
  "o.lan": number;
  "o.argumentOfPeriapsis": number;
  "o.period": number;
  "o.epoch": number;
  "o.referenceBody": string;

  // Anomalies
  "o.trueAnomaly": number;
  "o.meanAnomaly": number;
  "o.eccentricAnomaly": number;
  "o.orbitPercent": number;

  // Velocity & energy
  "o.orbitalSpeed": number;
  "o.radius": number;
  "o.orbitalEnergy": number;

  // Patch transitions
  "o.timeToTransition1": number;
  "o.timeToTransition2": number;

  // --- t.* — Time ---
  "t.universalTime": number;
  "t.currentRate": number;
  "t.isPaused": boolean;

  // --- tar.* — Target ---
  "tar.name": string;
  "tar.type": string;
  "tar.distance": number;
  "tar.o.PeA": number;
  "tar.o.ApA": number;
  "tar.o.inclination": number;
  "tar.o.eccentricity": number;
  "tar.o.period": number;
  "tar.o.relativeVelocity": number;
  "tar.o.orbitingBody": string;
}
