import { registerDerivedKey } from "../derive";

/**
 * Register the built-in derived keys shipped with @gonogo/data.
 *
 * Called once from app setup (e.g. packages/app/src/dataSources/buffered.ts).
 * Tests that do not want derived-key side-effects should NOT call this.
 */
export function registerBuiltinDerivedKeys(): void {
  registerDerivedKey({
    id: "v.missionTimeHours",
    inputs: ["v.missionTime"],
    meta: { label: "Mission time (hours)", unit: "hr", group: "State" },
    fn: ([missionTime]) => (missionTime.v as number) / 3600,
  });

  registerDerivedKey({
    id: "v.altitudeRate",
    inputs: ["v.altitude"],
    meta: { label: "Altitude rate", unit: "m/s", group: "Velocity" },
    fn: ([altitude], previous) => {
      if (previous === null) return undefined;
      const dt = (altitude.t - previous[0].t) / 1000;
      if (dt <= 0) return undefined;
      return ((altitude.v as number) - (previous[0].v as number)) / dt;
    },
  });
}
