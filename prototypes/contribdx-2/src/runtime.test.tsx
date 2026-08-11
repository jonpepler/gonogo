// @vitest-environment jsdom
//
// The runtime half of the claim: MOUNTING a slot-bearing component is what
// makes its slot exist. No widget-side list, no module-scope handle; the
// widget renders `useContributedFilters<Row>()` and the slot
// `<widgetId>.filters` is announced, aggregated, and contributable.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  // biome-ignore lint/style/noRestrictedImports: standalone prototype outside the workspace; @ksp-gonogo/test-utils is not resolvable here and no kit primitives (so no theme) are rendered
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import {
  getRegisteredSlotKinds,
  onDuplicateMount,
  registerSlotKind,
} from "./core/componentSlots";
import { useContributedFilters } from "./core/contributedFilters";
import { clearContributions, registerContribution } from "./core/contributions";
import { WidgetHost } from "./core/WidgetHost";
import type { ResourceOpsUnit } from "./sdk";
import { IsruConsole } from "./widget/IsruConsole";
import { RESOURCE_OPS_FIXTURE, ResourceOps } from "./widget/ResourceOps";
import { ShipMapLite } from "./widget/ShipMapLite";

beforeEach(() => {
  clearContributions();
});

afterEach(() => {
  cleanup();
});

function contributeProcessAxis(slot: string) {
  registerContribution({
    id: `test/${slot}`,
    contributes: slot,
    compute: () => [
      {
        id: "running",
        label: "Running",
        group: "process",
        groupLabel: "Process",
        predicate: (unit: unknown) => {
          const u = unit as ResourceOpsUnit;
          return u.kind === "converter" && u.converter.running;
        },
      },
    ],
  });
}

test("mounting the widget is what creates the slot: a contribution lands with zero widget-side declarations", async () => {
  contributeProcessAxis("resource-ops.filters");
  render(
    <WidgetHost widgetId="resource-ops">
      <ResourceOps />
    </WidgetHost>,
  );

  // The contributed facet arrives through `<widget>.filters`, composed from
  // context: nothing in ResourceOps names the slot.
  const chip = await screen.findByRole("button", { name: "Running" });

  // All three fixture units visible before filtering.
  expect(screen.getAllByRole("listitem")).toHaveLength(
    RESOURCE_OPS_FIXTURE.length,
  );

  // Selecting the facet applies the contributor's predicate to the host rows.
  fireEvent.click(chip);
  await waitFor(() => {
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  expect(screen.getByRole("listitem")).toHaveTextContent("Convert-O-Tron 250");
});

test("the same component mounted twice under qualified keys is two independent slots", async () => {
  contributeProcessAxis("isru-console.process-filters");
  render(
    <WidgetHost widgetId="isru-console">
      <IsruConsole />
    </WidgetHost>,
  );

  const processBar = await screen.findByTestId("process-bar");
  expect(
    within(processBar).getByRole("button", { name: "Running" }),
  ).toBeDefined();
  // The resource bar is a different slot: the process contribution must not
  // leak into it.
  const resourceBar = screen.getByTestId("resource-bar");
  expect(within(resourceBar).queryByRole("button")).toBeNull();
});

test("a late contribution reaches an already-mounted slot", async () => {
  render(
    <WidgetHost widgetId="resource-ops">
      <ResourceOps />
    </WidgetHost>,
  );
  expect(screen.queryByRole("button")).toBeNull();

  contributeProcessAxis("resource-ops.filters");
  expect(await screen.findByRole("button", { name: "Running" })).toBeDefined();
});

test("the widget-led layer still works unchanged alongside", async () => {
  registerContribution({
    id: "test/ship-map-lite-meters",
    contributes: "ship-map-lite.part-meters",
    compute: () => [
      {
        partId: "p1",
        resource: "Ore",
        displayName: "Ore",
        amount: 120,
        capacity: 300,
      },
    ],
  });
  render(
    <WidgetHost
      widgetId="ship-map-lite"
      contributionSlots={["ship-map-lite.part-meters"]}
    >
      <ShipMapLite />
    </WidgetHost>,
  );
  expect(await screen.findByRole("listitem")).toHaveTextContent("Ore: 120/300");
});

test("two unqualified mounts of one kind in one widget report a duplicate", async () => {
  const duplicates: string[] = [];
  const off = onDuplicateMount((slotId) => duplicates.push(slotId));

  function DoubleBar() {
    const a = useContributedFilters<ResourceOpsUnit>();
    const b = useContributedFilters<ResourceOpsUnit>();
    return <output>{a.activeCount + b.activeCount}</output>;
  }
  render(
    <WidgetHost widgetId="resource-ops">
      <DoubleBar />
    </WidgetHost>,
  );
  await waitFor(() => {
    expect(duplicates).toContain("resource-ops.filters");
  });
  off();
});

test("slot kinds register passively at module load, collisions throw", () => {
  const kinds = getRegisteredSlotKinds().map((k) => k.kind);
  expect(kinds).toContain("filters");
  expect(() => registerSlotKind({ kind: "filters", name: "Impostor" })).toThrow(
    /already registered/,
  );
});
