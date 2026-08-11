import type { FilterEntry } from "@ksp-gonogo/sitrep-sdk";
import { act, render, screen } from "@ksp-gonogo/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { WidgetMetaContext } from "../contexts/WidgetMetaContext";
import { clearContributions, registerContribution } from "../contributions";
import { ContributionsProvider } from "../contributionsRuntime";
import { ContributedFilters } from "./ContributedFilters";

// The component-led slot path end to end: the widget under test declares
// NOTHING (empty `contributionSlots`, no declare-module line for the slot),
// mounts `<ContributedFilters>`, and the slot `fixture-widget.filters` is
// live purely because a contribution targets it (contributor-driven
// aggregation) and the component reads it (segment completed at mount).

interface Row {
  name: string;
  kerbal: boolean;
}

const ITEMS: readonly Row[] = [
  { name: "Jebediah", kerbal: true },
  { name: "Ore Tank", kerbal: false },
  { name: "Valentina", kerbal: true },
];

const kerbalFilter: FilterEntry<Row> = {
  id: "kerbals",
  label: "Kerbals",
  predicate: (row) => row.kerbal,
};

beforeEach(() => {
  clearContributions();
});

function Host() {
  return (
    <WidgetMetaContext.Provider
      value={{ componentId: "fixture-widget", contributionSlots: [] }}
    >
      <ContributionsProvider>
        <ContributedFilters items={ITEMS} allLabel="All rows">
          {(filtered) => (
            <ul>
              {filtered.map((row) => (
                <li key={row.name}>{row.name}</li>
              ))}
            </ul>
          )}
        </ContributedFilters>
      </ContributionsProvider>
    </WidgetMetaContext.Provider>
  );
}

describe("ContributedFilters (component-led slot)", () => {
  it("aggregates a contribution from mounting alone: no widget-side declaration anywhere", async () => {
    registerContribution({
      id: "fixture-kerbal-filter",
      contributes: "fixture-widget.filters",
      compute: () => [kerbalFilter],
    });

    render(<Host />);

    // All rows pass while nothing is selected.
    expect(screen.getByText("Jebediah")).toBeTruthy();
    expect(screen.getByText("Ore Tank")).toBeTruthy();

    // The contributed facet arrived without the widget declaring the slot.
    const chip = await screen.findByRole("button", { name: "Kerbals" });
    chip.click();

    expect(await screen.findByText("Valentina")).toBeTruthy();
    expect(screen.queryByText("Ore Tank")).toBeNull();
  });

  it("picks up a contribution registered after mount", async () => {
    render(<Host />);
    expect(screen.queryByRole("button", { name: "Kerbals" })).toBeNull();

    act(() => {
      registerContribution({
        id: "fixture-late-filter",
        contributes: "fixture-widget.filters",
        compute: () => [kerbalFilter],
      });
    });

    expect(await screen.findByRole("button", { name: "Kerbals" })).toBeTruthy();
  });

  it("degrades to a pass-through outside a widget", () => {
    registerContribution({
      id: "fixture-orphan-filter",
      contributes: "fixture-widget.filters",
      compute: () => [kerbalFilter],
    });

    render(
      <ContributedFilters items={ITEMS}>
        {(filtered) => (
          <ul>
            {filtered.map((row) => (
              <li key={row.name}>{row.name}</li>
            ))}
          </ul>
        )}
      </ContributedFilters>,
    );

    // No widget identity, so no slot id: every item passes, no control shows.
    expect(screen.getByText("Ore Tank")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kerbals" })).toBeNull();
  });

  it("completes an overridden segment to <widget>.<segment>", async () => {
    registerContribution({
      id: "fixture-secondary-filter",
      contributes: "fixture-widget.crew-filters",
      compute: () => [kerbalFilter],
    });

    render(
      <WidgetMetaContext.Provider
        value={{ componentId: "fixture-widget", contributionSlots: [] }}
      >
        <ContributionsProvider>
          <ContributedFilters items={ITEMS} segment="crew-filters">
            {(filtered) => <output>{filtered.length}</output>}
          </ContributedFilters>
        </ContributionsProvider>
      </WidgetMetaContext.Provider>,
    );

    expect(await screen.findByRole("button", { name: "Kerbals" })).toBeTruthy();
  });
});
