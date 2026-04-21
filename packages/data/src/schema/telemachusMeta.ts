import type { DataKeyMeta } from "../types";

type MetaEntry = Omit<DataKeyMeta, "key">;

/**
 * Human-facing metadata for every static key in TelemaachusSchema.
 * Dynamic indexed keys (`b.name[N]` etc.) are not listed here — they get the
 * "Other" group fallback in `enrichKey`.
 */
export const TELEMACHUS_META: Record<string, MetaEntry> = {
  // --- Position & altitude ---
  "v.altitude": { label: "Altitude", unit: "m", group: "Position" },
  "v.heightFromTerrain": { label: "Height from terrain", unit: "m", group: "Position" },
  "v.heightFromSurface": { label: "Height from surface", unit: "m", group: "Position" },
  "v.terrainHeight": { label: "Terrain height", unit: "m", group: "Position" },
  "v.lat": { label: "Latitude", unit: "°", group: "Position" },
  "v.long": { label: "Longitude", unit: "°", group: "Position" },

  // --- Velocity ---
  "v.surfaceSpeed": { label: "Surface speed", unit: "m/s", group: "Velocity" },
  "v.verticalSpeed": { label: "Vertical speed", unit: "m/s", group: "Velocity" },
  "v.obtSpeed": { label: "Orbital speed", unit: "m/s", group: "Velocity" },
  "v.orbitalVelocity": { label: "Orbital velocity", unit: "m/s", group: "Velocity" },
  "v.surfaceVelocity": { label: "Surface velocity", unit: "m/s", group: "Velocity" },
  "v.speed": { label: "Speed", unit: "m/s", group: "Velocity" },
  "v.srfSpeed": { label: "Surface speed (alt)", unit: "m/s", group: "Velocity" },

  // --- Forces & environment ---
  "v.geeForce": { label: "G-force", unit: "g", group: "Forces" },
  "v.geeForceImmediate": { label: "G-force (immediate)", unit: "g", group: "Forces" },
  "v.mass": { label: "Mass", unit: "kg", group: "Forces" },
  "v.mach": { label: "Mach number", unit: "raw", group: "Forces" },
  "v.dynamicPressure": { label: "Dynamic pressure", unit: "Pa", group: "Forces" },
  "v.dynamicPressurekPa": { label: "Dynamic pressure (kPa)", unit: "kPa", group: "Forces" },
  "v.staticPressure": { label: "Static pressure", unit: "Pa", group: "Forces" },
  "v.atmosphericPressure": { label: "Atmospheric pressure", unit: "kPa", group: "Forces" },

  // --- State & situation ---
  "v.name": { label: "Vessel name", unit: "enum", group: "State" },
  "v.body": { label: "Current body", unit: "enum", group: "State" },
  "v.situation": { label: "Situation", unit: "enum", group: "State" },
  "v.situationString": { label: "Situation (string)", unit: "enum", group: "State" },
  "v.missionTime": { label: "Mission time", unit: "s", group: "State" },
  "v.missionTimeString": { label: "Mission time (string)", unit: "enum", group: "State" },
  "v.currentStage": { label: "Current stage", unit: "raw", group: "State" },
  "v.landed": { label: "Landed", unit: "bool", group: "State" },
  "v.splashed": { label: "Splashed", unit: "bool", group: "State" },
  "v.landedAt": { label: "Landed at", unit: "enum", group: "State" },
  "v.isEVA": { label: "Is EVA", unit: "bool", group: "State" },
  "v.angleToPrograde": { label: "Angle to prograde", unit: "°", group: "State" },

  // --- Action groups ---
  "v.sasValue": { label: "SAS", unit: "bool", group: "Actions" },
  "v.rcsValue": { label: "RCS", unit: "bool", group: "Actions" },
  "v.lightValue": { label: "Lights", unit: "bool", group: "Actions" },
  "v.brakeValue": { label: "Brakes", unit: "bool", group: "Actions" },
  "v.gearValue": { label: "Gear", unit: "bool", group: "Actions" },
  "v.abortValue": { label: "Abort", unit: "bool", group: "Actions" },
  "v.precisionControlValue": { label: "Precision control", unit: "bool", group: "Actions" },
  "v.ag1Value": { label: "Action group 1", unit: "bool", group: "Actions" },
  "v.ag2Value": { label: "Action group 2", unit: "bool", group: "Actions" },
  "v.ag3Value": { label: "Action group 3", unit: "bool", group: "Actions" },
  "v.ag4Value": { label: "Action group 4", unit: "bool", group: "Actions" },
  "v.ag5Value": { label: "Action group 5", unit: "bool", group: "Actions" },
  "v.ag6Value": { label: "Action group 6", unit: "bool", group: "Actions" },
  "v.ag7Value": { label: "Action group 7", unit: "bool", group: "Actions" },
  "v.ag8Value": { label: "Action group 8", unit: "bool", group: "Actions" },
  "v.ag9Value": { label: "Action group 9", unit: "bool", group: "Actions" },
  "v.ag10Value": { label: "Action group 10", unit: "bool", group: "Actions" },

  // --- Navigation ---
  "n.heading": { label: "Heading", unit: "°", group: "Navigation" },
  "n.pitch": { label: "Pitch", unit: "°", group: "Navigation" },
  "n.roll": { label: "Roll", unit: "°", group: "Navigation" },
  "n.rawheading": { label: "Heading (raw)", unit: "°", group: "Navigation" },
  "n.rawpitch": { label: "Pitch (raw)", unit: "°", group: "Navigation" },
  "n.rawroll": { label: "Roll (raw)", unit: "°", group: "Navigation" },
  "n.heading2": { label: "Heading 2", unit: "°", group: "Navigation" },
  "n.pitch2": { label: "Pitch 2", unit: "°", group: "Navigation" },
  "n.roll2": { label: "Roll 2", unit: "°", group: "Navigation" },

  // --- Flight control ---
  "f.throttle": { label: "Throttle", unit: "%", group: "Flight control" },

  // --- Orbit: apsides ---
  "o.ApA": { label: "Apoapsis", unit: "m", group: "Orbit" },
  "o.PeA": { label: "Periapsis", unit: "m", group: "Orbit" },
  "o.ApR": { label: "Apoapsis radius", unit: "m", group: "Orbit" },
  "o.PeR": { label: "Periapsis radius", unit: "m", group: "Orbit" },
  "o.timeToAp": { label: "Time to apoapsis", unit: "s", group: "Orbit" },
  "o.timeToPe": { label: "Time to periapsis", unit: "s", group: "Orbit" },

  // --- Orbit: Keplerian elements ---
  "o.sma": { label: "Semi-major axis", unit: "m", group: "Orbit" },
  "o.semiMinorAxis": { label: "Semi-minor axis", unit: "m", group: "Orbit" },
  "o.semiLatusRectum": { label: "Semi-latus rectum", unit: "m", group: "Orbit" },
  "o.eccentricity": { label: "Eccentricity", unit: "raw", group: "Orbit" },
  "o.inclination": { label: "Inclination", unit: "°", group: "Orbit" },
  "o.lan": { label: "Long. of ascending node", unit: "°", group: "Orbit" },
  "o.argumentOfPeriapsis": { label: "Arg. of periapsis", unit: "°", group: "Orbit" },
  "o.period": { label: "Orbital period", unit: "s", group: "Orbit" },
  "o.epoch": { label: "Epoch", unit: "s", group: "Orbit" },
  "o.referenceBody": { label: "Reference body", unit: "enum", group: "Orbit" },

  // --- Orbit: anomalies ---
  "o.trueAnomaly": { label: "True anomaly", unit: "°", group: "Orbit" },
  "o.meanAnomaly": { label: "Mean anomaly", unit: "°", group: "Orbit" },
  "o.eccentricAnomaly": { label: "Eccentric anomaly", unit: "°", group: "Orbit" },
  "o.orbitPercent": { label: "Orbit percent", unit: "%", group: "Orbit" },

  // --- Orbit: velocity & energy ---
  "o.orbitalSpeed": { label: "Orbital speed", unit: "m/s", group: "Orbit" },
  "o.radius": { label: "Orbital radius", unit: "m", group: "Orbit" },
  "o.orbitalEnergy": { label: "Orbital energy", unit: "raw", group: "Orbit" },

  // --- Orbit: patch transitions ---
  "o.timeToTransition1": { label: "Time to transition 1", unit: "s", group: "Orbit" },
  "o.timeToTransition2": { label: "Time to transition 2", unit: "s", group: "Orbit" },

  // --- Celestial bodies ---
  "b.number": { label: "Body count", unit: "raw", group: "Bodies" },

  // --- Resources ---
  // Units: stock KSP resources are "units" (not litres / kg) — labelled "raw"
  // here since no domain-specific unit applies.
  "r.resource[LiquidFuel]": { label: "Liquid Fuel", unit: "raw", group: "Resources" },
  "r.resourceMax[LiquidFuel]": { label: "Liquid Fuel (max)", unit: "raw", group: "Resources" },
  "r.resourceCurrent[LiquidFuel]": { label: "Liquid Fuel (stage)", unit: "raw", group: "Resources" },
  "r.resourceCurrentMax[LiquidFuel]": { label: "Liquid Fuel (stage max)", unit: "raw", group: "Resources" },

  "r.resource[Oxidizer]": { label: "Oxidizer", unit: "raw", group: "Resources" },
  "r.resourceMax[Oxidizer]": { label: "Oxidizer (max)", unit: "raw", group: "Resources" },
  "r.resourceCurrent[Oxidizer]": { label: "Oxidizer (stage)", unit: "raw", group: "Resources" },
  "r.resourceCurrentMax[Oxidizer]": { label: "Oxidizer (stage max)", unit: "raw", group: "Resources" },

  "r.resource[MonoPropellant]": { label: "Monopropellant (RCS)", unit: "raw", group: "Resources" },
  "r.resourceMax[MonoPropellant]": { label: "Monopropellant max", unit: "raw", group: "Resources" },
  "r.resourceCurrent[MonoPropellant]": { label: "Monopropellant (stage)", unit: "raw", group: "Resources" },
  "r.resourceCurrentMax[MonoPropellant]": { label: "Monopropellant (stage max)", unit: "raw", group: "Resources" },

  "r.resource[XenonGas]": { label: "Xenon Gas", unit: "raw", group: "Resources" },
  "r.resourceMax[XenonGas]": { label: "Xenon Gas (max)", unit: "raw", group: "Resources" },
  "r.resourceCurrent[XenonGas]": { label: "Xenon Gas (stage)", unit: "raw", group: "Resources" },
  "r.resourceCurrentMax[XenonGas]": { label: "Xenon Gas (stage max)", unit: "raw", group: "Resources" },

  "r.resource[ElectricCharge]": { label: "Electric Charge", unit: "raw", group: "Resources" },
  "r.resourceMax[ElectricCharge]": { label: "Electric Charge (max)", unit: "raw", group: "Resources" },
  "r.resourceCurrent[ElectricCharge]": { label: "Electric Charge (stage)", unit: "raw", group: "Resources" },
  "r.resourceCurrentMax[ElectricCharge]": { label: "Electric Charge (stage max)", unit: "raw", group: "Resources" },

  // --- Stage delta-V / mass ---
  "dv.stageCount": { label: "Stage count", unit: "raw", group: "Stages" },
  // Per-stage indexed keys (dv.stageFuelMass[0..9]) fall through to the "Other"
  // group via enrichKey — the fuel widget reads them by constructed key and
  // doesn't need them in the DataKeyPicker.

  // --- CommNet signal state ---
  "comm.connected": { label: "CommNet connected", unit: "bool", group: "CommNet" },
  "comm.signalStrength": { label: "Signal strength", unit: "raw", group: "CommNet" },
  "comm.controlState": { label: "Control state", unit: "raw", group: "CommNet" },
  "comm.controlStateName": { label: "Control state (name)", unit: "enum", group: "CommNet" },
  "comm.signalDelay": { label: "Signal delay", unit: "s", group: "CommNet" },

  // --- Time ---
  "t.universalTime": { label: "Universal time", unit: "s", group: "Time" },
  "t.currentRate": { label: "Time warp rate", unit: "raw", group: "Time" },
  "t.isPaused": { label: "Is paused", unit: "bool", group: "Time" },

  // --- Target ---
  "tar.name": { label: "Target name", unit: "enum", group: "Target" },
  "tar.type": { label: "Target type", unit: "enum", group: "Target" },
  "tar.distance": { label: "Target distance", unit: "m", group: "Target" },
  "tar.o.PeA": { label: "Target periapsis", unit: "m", group: "Target" },
  "tar.o.ApA": { label: "Target apoapsis", unit: "m", group: "Target" },
  "tar.o.inclination": { label: "Target inclination", unit: "°", group: "Target" },
  "tar.o.eccentricity": { label: "Target eccentricity", unit: "raw", group: "Target" },
  "tar.o.period": { label: "Target period", unit: "s", group: "Target" },
  "tar.o.relativeVelocity": { label: "Relative velocity", unit: "m/s", group: "Target" },
  "tar.o.orbitingBody": { label: "Target orbiting body", unit: "enum", group: "Target" },
};

/** Enrich a raw key with metadata. Falls back to `{ label: key, group: "Other" }`. */
export function enrichKey(key: string): Omit<DataKeyMeta, "key"> {
  return TELEMACHUS_META[key] ?? { label: key, group: "Other" };
}
