// The runtime half: importing a widget module is all it takes for its slots to
// exist, exactly as importing a component module is all it takes for
// `registerComponent` / `registerUnit` to have run. No mount, no provider, no
// widget-side list.

import { expect, test } from "vitest";
import { getContributionsForSlot, getRegisteredSlots } from "./kit/slots";
import "./widget/ResourceOps";
import "./uplink/HabitatWidget";
import "./contributor/good";
import "./contributor/broadcast";
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
  // 2 addressed to this slot, plus the 1 broadcast over these rows
  expect(getContributionsForSlot("resource-ops.filter.process")).toHaveLength(
    3,
  );
  // 1 addressed to this slot, plus the same broadcast
  expect(
    getContributionsForSlot("resource-ops.filter.byResource"),
  ).toHaveLength(2);
});

test("a broadcast reaches every filter over its rows, and only those", () => {
  const ids = (slot: string) => getContributionsForSlot(slot).map((c) => c.id);
  // The cost of dropping the widget id, made concrete: a facet meant for the
  // process axis lands on the resource axis too.
  expect(ids("resource-ops.filter.process")).toContain(
    "kerbalism/any-resource-ops-filter",
  );
  expect(ids("resource-ops.filter.byResource")).toContain(
    "kerbalism/any-resource-ops-filter",
  );
  // Rows are what bound it: a filter over Habitat rows is untouched, which is
  // the runtime error a widget-free, row-free key could not have prevented.
  expect(ids("kerbalism-habitat.filter.pressure")).not.toContain(
    "kerbalism/any-resource-ops-filter",
  );
});

test("the same component in two widgets stays separate", () => {
  expect(
    getContributionsForSlot("kerbalism-habitat.filter.pressure"),
  ).toHaveLength(1);
});
