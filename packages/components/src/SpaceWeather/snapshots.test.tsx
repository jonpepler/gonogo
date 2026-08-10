/**
 * DOM-snapshot regression tests for the SpaceWeather widget.
 *
 * Catches structural drift (rendered text, element order, attribute changes)
 * across every fixture × mode combination registered for the widget. The
 * matching PNG renders live in `local_docs/renders/space-weather-widget/` and
 * cover the visual layer DOM snapshots can't (the sun/ring/spike SVG paint,
 * fonts).
 *
 * SpaceWeather reads the sun-vantage `kerbalism.spaceweather` Topic
 * (`Stars`/`Storms`/`StormEjectionSpeed`) through a real `TelemetryProvider`,
 * fed here via the `sw.*`-prefixed fixture keys `widgetDomSnapshot` reshapes
 * onto the wire (see `resolveKerbalismSpaceWeatherWire`).
 *
 * If the widget output intentionally changes, regenerate with
 * `pnpm --filter @ksp-gonogo/components exec vitest run src/SpaceWeather/snapshots -u`.
 */
import { describe, expect, it } from "vitest";
import { getWidget } from "../../scripts/widgets";
import { snapshotWidgetMode } from "../test/widgetDomSnapshot";
import binary from "./__fixtures__/binary.json";
import quiet from "./__fixtures__/quiet.json";
import stormImpact from "./__fixtures__/storm-impact.json";
import stormInbound from "./__fixtures__/storm-inbound.json";
import { SpaceWeatherComponent } from "./index";

const FIXTURES = {
  quiet,
  binary,
  "storm-inbound": stormInbound,
  "storm-impact": stormImpact,
};

const config = getWidget("space-weather");
if (!config) throw new Error("space-weather missing from widgets.ts");

describe("SpaceWeather DOM snapshots", () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    for (const mode of config.modes) {
      it(`${name} @ ${mode.name}`, async () => {
        const html = await snapshotWidgetMode({
          Widget: SpaceWeatherComponent,
          fixture,
          mode,
        });
        expect(html).toMatchSnapshot();
      });
    }
  }
});
