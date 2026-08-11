import { render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { WidgetMetaContext } from "./contexts/WidgetMetaContext";
import {
  clearContributionSlotKinds,
  getContributionSlotKinds,
  registerContributionSlotKind,
} from "./contributionSlotKinds";
import { clearContributions, registerContribution } from "./contributions";
import {
  ContributionsProvider,
  useContributionSlot,
} from "./contributionsRuntime";

// The three roles of the component-led layer, end to end with the real
// registry, real provider, and real aggregation, per the repo's testing
// philosophy (no mocked internals).

interface ChipEntry {
  id: string;
  label: string;
}

beforeEach(() => {
  clearContributions();
  clearContributionSlotKinds();
});

// Role 1: the component author. One passive registration at module scope
// (re-created per test here because beforeEach clears the registry), then the
// component reads its own slot wherever it is mounted.
function makeChips() {
  const CHIPS = registerContributionSlotKind<ChipEntry>({
    kind: "chips",
    name: "Chips",
    description: "Little labelled chips under the host widget's header",
  });
  function ChipStrip({ qualifier }: { qualifier?: string }) {
    const { slotId, entries } = useContributionSlot(CHIPS, { qualifier });
    return (
      <ul aria-label={slotId ?? "unmounted"}>
        {entries.map((entry) => (
          <li key={`${entry.contributionId}:${entry.id}`}>{entry.label}</li>
        ))}
      </ul>
    );
  }
  return ChipStrip;
}

// Role 2: the widget author. Mounts the component, declares nothing: no
// contributionSlots entry, no slot id string anywhere in the widget.
function Widget({
  widgetId,
  children,
}: {
  widgetId: string;
  children: React.ReactNode;
}) {
  return (
    <WidgetMetaContext.Provider
      value={{ componentId: widgetId, contributionSlots: [] }}
    >
      <ContributionsProvider>{children}</ContributionsProvider>
    </WidgetMetaContext.Provider>
  );
}

describe("component-led contribution slots", () => {
  it("mints <widgetId>.<kind> from the host widget and aggregates contributions to it", async () => {
    const ChipStrip = makeChips();
    // Role 3: the provider, targeting the minted address.
    registerContribution({
      id: "test/alpha-chip",
      contributes: "fixture-widget.chips",
      compute: () => [{ id: "alpha", label: "Alpha" }],
    });

    render(
      <Widget widgetId="fixture-widget">
        <ChipStrip />
      </Widget>,
    );

    expect(
      screen.getByRole("list", { name: "fixture-widget.chips" }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeTruthy();
    });
  });

  it("gives the same component a different address in a different widget", async () => {
    const ChipStrip = makeChips();
    registerContribution({
      id: "test/beta-chip",
      contributes: "other-widget.chips",
      compute: () => [{ id: "beta", label: "Beta" }],
    });

    render(
      <>
        <Widget widgetId="fixture-widget">
          <ChipStrip />
        </Widget>
        <Widget widgetId="other-widget">
          <ChipStrip />
        </Widget>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeTruthy();
    });
    // The contribution addressed the other widget only.
    const fixtureList = screen.getByRole("list", {
      name: "fixture-widget.chips",
    });
    expect(fixtureList.childElementCount).toBe(0);
  });

  it("shares one pool across two mounts of the same kind, and splits on a qualifier", async () => {
    const ChipStrip = makeChips();
    registerContribution({
      id: "test/shared-chip",
      contributes: "fixture-widget.chips",
      compute: () => [{ id: "shared", label: "Shared" }],
    });
    registerContribution({
      id: "test/header-chip",
      contributes: "fixture-widget.header-chips",
      compute: () => [{ id: "header", label: "Header only" }],
    });

    render(
      <Widget widgetId="fixture-widget">
        <ChipStrip />
        <ChipStrip />
        <ChipStrip qualifier="header" />
      </Widget>,
    );

    // Both unqualified mounts show the shared pool.
    await waitFor(() => {
      expect(screen.getAllByText("Shared")).toHaveLength(2);
    });
    // The qualified mount is its own extension point.
    await waitFor(() => {
      expect(screen.getByText("Header only")).toBeTruthy();
    });
    expect(
      screen.getByRole("list", { name: "fixture-widget.header-chips" }),
    ).toBeTruthy();
  });

  it("is stably empty outside a widget", () => {
    const ChipStrip = makeChips();
    render(<ChipStrip />);
    expect(screen.getByRole("list", { name: "unmounted" })).toBeTruthy();
  });

  it("rejects a second registration of the same kind and a dotted kind id", () => {
    registerContributionSlotKind({ kind: "chips", name: "Chips" });
    expect(() =>
      registerContributionSlotKind({ kind: "chips", name: "Other chips" }),
    ).toThrow(/already registered/);
    expect(() =>
      registerContributionSlotKind({ kind: "part.meters", name: "Dotted" }),
    ).toThrow(/must not contain/);
    expect(getContributionSlotKinds().map((k) => k.kind)).toEqual(["chips"]);
  });
});
