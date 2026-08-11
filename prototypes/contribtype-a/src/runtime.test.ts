// The runtime half: importing a widget module is all it takes for its slots to
// exist, exactly as importing a component module is all it takes for
// `registerComponent` / `registerUnit` to have run. No mount, no provider, no
// widget-side list.

import { expect, test } from "vitest";
import { getContributionsForSlot, getRegisteredSlots } from "./kit/slots";
import "./widget/ResourceOps";
import "./uplink/HabitatWidget";
import "./contributor/good";
import "./uplink-contributor/good";

test("a widget's slots register passively at module load", () => {
  const ids = getRegisteredSlots()
    .map((s) => s.slotId)
    .sort();
  expect(ids).toContain("resource-ops.filter.process");
  expect(ids).toContain("resource-ops.filter.byResource");
  expect(ids).toContain("kerbalism-habitat.filter.pressure");
  expect(ids).toContain("kerbalism-habitat.meter.supplies");
});

test("the composed id carries widget, component and instance", () => {
  const slot = getRegisteredSlots().find(
    (s) => s.slotId === "resource-ops.filter.process",
  );
  expect(slot).toMatchObject({
    widgetId: "resource-ops",
    componentId: "filter",
    instanceName: "process",
    topics: ["isru.converters"],
  });
});

test("two instances of one component in one widget stay separate", () => {
  expect(getContributionsForSlot("resource-ops.filter.process")).toHaveLength(
    2,
  );
  expect(
    getContributionsForSlot("resource-ops.filter.byResource"),
  ).toHaveLength(1);
});

test("the same component in two widgets stays separate", () => {
  expect(
    getContributionsForSlot("kerbalism-habitat.filter.pressure"),
  ).toHaveLength(1);
});
