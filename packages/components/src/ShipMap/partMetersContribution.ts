import { CORE_UPLINK_CLIENT } from "@ksp-gonogo/core";
import { buildResourcesByFlightId } from "@ksp-gonogo/data";
import type { VesselParts } from "@ksp-gonogo/sitrep-sdk";
import type { MeterTone } from "@ksp-gonogo/ui-kit";
import type { ShipMapPartMeterEntry } from "./shipTopology";

// ---------------------------------------------------------------------------
// The built-in half of the `ship-map.part-meters` self-contribution (spec
// §13.4, the framework's flagship demonstration): the five classic
// drainable propellants, moved off ShipDiagramSvg's old hardcoded `DRAINABLE`
// Set + `resourceColor` switch and onto the SAME contribution slot a
// Kerbalism-style Uplink contributes its own supply tanks to
// (`mod/GonogoKerbalismUplink/client/src/ShipMap/partMeters.ts`). ShipMap
// itself no longer knows which resource deserves a meter; that judgement
// call now lives entirely in contributions, this one included.
//
// Deliberately NOT widened to "every resource on every part": the deleted
// `DRAINABLE` comment's own reasoning still holds (a bar on every resource on
// every part is worse than bars on five well-chosen ones), it just now lives
// here instead of gating a hardcoded Set. A future contribution is free to
// add more resources; this one keeps the original five so the built-in
// behaviour is unchanged.
//
// Reads `vessel.parts` directly (the same Topic `usePartsLive`/`useTopology`
// already derive ShipMap's own view-model from) rather than a React hook:
// contributions are evaluated by the aggregator outside any component, so the
// pure `buildResourcesByFlightId` reshaping helper is shared instead of
// duplicated.
// ---------------------------------------------------------------------------

const DRAINABLE_TONES: Record<string, MeterTone> = {
  // MeterTone has five values (neutral/go/warn/nogo/info), a smaller
  // vocabulary than the old `resourceColor`'s five bespoke CSS-var picks
  // (accent/info/warning/warning/cyan). Mapped as closely as the shared
  // tone set allows, with ONE deliberate deviation: ui-kit's "info" tone
  // resolves to `--color-status-info-bg`, a near-black token value, clearly
  // meant for a tinted PANEL background, not a filled meter bar; a
  // real render (`local_docs/renders/kerbalism-shipmap/`) confirmed it is
  // visually indistinguishable from the diagram's black canvas. "info" is
  // avoided entirely below rather than shipping an invisible bar; flagged
  // as a real ui-kit token bug for the operator (every OTHER `<Meter
  // tone="info">` in the app likely renders the same way against a dark
  // surface). SolidFuel and MonoPropellant already shared one colour
  // (warning) before this change, so reusing "warn" for a third resource
  // loses no distinction that existed.
  LiquidFuel: "go",
  Oxidizer: "neutral",
  SolidFuel: "warn",
  MonoPropellant: "warn",
  XenonGas: "warn",
};

/**
 * Pure core of the built-in contribution, exported so a test can call it
 * directly against a plain `VesselParts` fixture without going through the
 * contribution registry at all (mirrors `spaceWeatherBadges`'s own
 * export-the-pure-core pattern in the Kerbalism Uplink).
 */
export function computeBuiltinPartMeters(
  wire: VesselParts | undefined,
): readonly ShipMapPartMeterEntry[] {
  if (!wire) return [];
  const byFlightId = buildResourcesByFlightId(wire);
  const entries: ShipMapPartMeterEntry[] = [];
  for (const [flightId, resources] of byFlightId) {
    for (const [name, tone] of Object.entries(DRAINABLE_TONES)) {
      const slot = resources[name];
      if (!slot || slot.maxAmount <= 0) continue;
      entries.push({
        partId: String(flightId),
        resource: name,
        displayName: name,
        amount: slot.amount,
        capacity: slot.maxAmount,
        tone,
      });
    }
  }
  return entries;
}

CORE_UPLINK_CLIENT.registerContribution({
  id: "ship-map-part-meters",
  contributes: "ship-map.part-meters",
  deps: ["vessel.parts"],
  compute: (topics) => computeBuiltinPartMeters(topics["vessel.parts"]),
});
