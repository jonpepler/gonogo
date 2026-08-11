// The runtime half, end to end, against the real components: render the
// dashboard and check that the slots exist, that a contribution reaches the
// right one, that a misaddressed contribution is caught, and that the generated
// manifest matches what rendering produced.
//
//   ../../node_modules/.bin/vitest run --config vitest.config.ts

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// A research prototype outside the workspace, so @ksp-gonogo/test-utils is not
// resolvable here, and nothing rendered below needs the theme it supplies.
// biome-ignore lint/style/noRestrictedImports: see above
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dashboard } from "../src/host/orchestrator";
import {
  clearSlotInstances,
  dumpSlotManifest,
  findMisaddressedContributions,
  getMountedSlots,
  registerContribution,
} from "../src/sdk";
import { emitSlotManifest } from "../src/sdk/emitSlotManifest";

const MANIFEST_PATH = resolve(
  process.cwd(),
  "src/sdk/__generated__/slot-manifest.ts",
);

describe("the component-led contribution bridge", () => {
  beforeEach(() => {
    clearSlotInstances();
  });
  afterEach(() => {
    clearSlotInstances();
  });

  it("learns every slot from the render alone", () => {
    render(<Dashboard />);

    expect(
      getMountedSlots()
        .map((s) => s.slotId)
        .sort(),
    ).toEqual([
      // variant A: widget.component.instance
      "resource-ops.filter.process",
      "resource-ops.filter.resource",
      "ship-map.meter.supplies",
      // variant B: component.subject, mounted by TWO widgets, one slot
      "subject-filter.isru-unit",
    ]);
  });

  it("composes the slot id from context, component and prop", () => {
    render(<Dashboard />);

    const process = getMountedSlots().find(
      (s) => s.slotId === "resource-ops.filter.process",
    );
    expect(process).toEqual({
      slotId: "resource-ops.filter.process",
      // from WidgetHost, which the orchestrator supplies
      widgetId: "resource-ops",
      // from the component itself
      componentId: "filter",
      // from the JSX use site
      name: "process",
      keying: "widget",
    });
  });

  it("routes a contribution to the instance it named, not the other one", () => {
    registerContribution({
      id: "test:process-only",
      contributes: "resource-ops.filter.process",
      compute: () => [
        {
          id: "converters",
          label: "Converters only",
          predicate: (item) => item.kind === "converter",
        },
      ],
    });

    render(<Dashboard />);

    // The label lands inside the `process` fieldset and nowhere else.
    const processFilter = screen.getByRole("group", { name: "process" });
    expect(processFilter.textContent).toContain("Converters only");
    expect(
      screen.getByRole("group", { name: "resource" }).textContent,
    ).not.toContain("Converters only");
  });

  it("catches the one mistake the compiler cannot: a typo'd instance name", () => {
    registerContribution({
      id: "test:typo",
      contributes: "resource-ops.filter.procces" as never,
      compute: () => [],
    });

    render(<Dashboard />);

    expect(findMisaddressedContributions()).toEqual([
      {
        target: "resource-ops.filter.procces",
        didYouMean: [
          "resource-ops.filter.process",
          "resource-ops.filter.resource",
        ],
      },
    ]);
  });

  it("regenerates the committed manifest byte for byte", () => {
    render(<Dashboard />);

    // The gate: what rendering produced must equal what is committed, exactly
    // as the visual baselines work. A widget adding, renaming or deleting a slot
    // instance fails here with the fix already written out.
    expect(emitSlotManifest(dumpSlotManifest())).toEqual(
      readFileSync(MANIFEST_PATH, "utf8"),
    );
  });
});

describe("variant B: subject-keyed slots", () => {
  beforeEach(() => {
    clearSlotInstances();
  });
  afterEach(() => {
    clearSlotInstances();
  });

  it("one contribution reaches every widget that filters that subject", () => {
    registerContribution({
      id: "test:isru-running",
      contributes: "subject-filter.isru-unit",
      compute: () => [
        {
          id: "running",
          label: "Running",
          predicate: (item) => item.kind === "converter",
        },
      ],
    });

    render(<Dashboard />);

    // Two separate widgets, two separate filter bars, one contribution.
    expect(
      screen.getByRole("group", { name: "isru process" }).textContent,
    ).toContain("Running");
    expect(
      screen.getByRole("group", { name: "isru compact" }).textContent,
    ).toContain("Running");
  });

  it("lets a contribution narrow itself to one widget", () => {
    registerContribution({
      id: "test:isru-broad",
      contributes: "subject-filter.isru-unit",
      compute: () => [
        { id: "broad", label: "Everywhere", predicate: () => true },
      ],
    });
    registerContribution({
      id: "test:isru-narrow",
      contributes: "subject-filter.isru-unit@isru-console" as never,
      compute: () => [
        { id: "narrow", label: "Console only", predicate: () => true },
      ],
    });

    render(<Dashboard />);

    const console_ = screen.getByRole("group", { name: "isru process" });
    const strip = screen.getByRole("group", { name: "isru compact" });
    expect(console_.textContent).toContain("Everywhere");
    expect(console_.textContent).toContain("Console only");
    expect(strip.textContent).toContain("Everywhere");
    expect(strip.textContent).not.toContain("Console only");
  });

  it("collapses two bars over the same subject into ONE slot", () => {
    render(<Dashboard />);

    // The cost of variant B, stated as a test: the two ISRU widgets cannot be
    // told apart by a contributor, because the key does not mention them.
    const isru = getMountedSlots().filter((s) =>
      s.slotId.startsWith("subject-filter."),
    );
    expect(isru.map((s) => s.slotId)).toEqual(["subject-filter.isru-unit"]);
  });
});
