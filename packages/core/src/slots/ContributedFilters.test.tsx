import { render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { WidgetMetaContext } from "../contexts/WidgetMetaContext";
import { clearContributions, registerContribution } from "../contributions";
import { ContributionsProvider } from "../contributionsRuntime";
import { ContributedFilters } from "./ContributedFilters";

// The component-led slot mechanism, exercised through its shipping component.
// The slot id `filters.FixtureRow` is component-scoped: it never names a
// widget, both halves are statically declared (the component's segment; the
// rows name below), and mounting the component inside ANY widget's provider
// is what makes it live there.

interface FixtureRow {
  id: string;
  flavour: "sweet" | "savoury";
}

declare module "@ksp-gonogo/sitrep-sdk" {
  interface ContributionRows {
    FixtureRow: FixtureRow;
  }
}

const ROWS: readonly FixtureRow[] = [
  { id: "cake", flavour: "sweet" },
  { id: "pie", flavour: "savoury" },
];

function Widget({ widgetId }: { widgetId: string }) {
  return (
    <WidgetMetaContext.Provider
      value={{ componentId: widgetId, contributionSlots: [] }}
    >
      <ContributionsProvider>
        <ContributedFilters rows="FixtureRow" items={ROWS} allLabel="All">
          {(filtered) => (
            <ul aria-label={`${widgetId}-rows`}>
              {filtered.map((row) => (
                <li key={row.id}>{row.id}</li>
              ))}
            </ul>
          )}
        </ContributedFilters>
      </ContributionsProvider>
    </WidgetMetaContext.Provider>
  );
}

beforeEach(() => {
  clearContributions();
});

describe("ContributedFilters (component-led slot)", () => {
  it("mounting alone makes the slot live: no contributionSlots listing, no widget-side hook", async () => {
    registerContribution({
      id: "fixture-sweet",
      contributes: "filters.FixtureRow",
      compute: () => [
        {
          id: "sweet",
          label: "Sweet",
          predicate: (row) => row.flavour === "sweet",
        },
      ],
    });

    render(<Widget widgetId="widget-a" />);
    // The contributed facet arrives with zero widget-side slot declarations.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sweet" })).toBeDefined();
    });
    // Nothing selected: everything shows.
    expect(screen.getByText("cake")).toBeDefined();
    expect(screen.getByText("pie")).toBeDefined();
  });

  it("reaches every widget that renders the component over these rows", async () => {
    registerContribution({
      id: "fixture-sweet",
      contributes: "filters.FixtureRow",
      compute: () => [
        {
          id: "sweet",
          label: "Sweet",
          predicate: (row) => row.flavour === "sweet",
        },
      ],
    });

    render(
      <>
        <Widget widgetId="widget-a" />
        <Widget widgetId="widget-b" />
      </>,
    );
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Sweet" })).toHaveLength(2);
    });
  });

  it("onlyIn confines a contribution to the named widget", async () => {
    registerContribution({
      id: "fixture-sweet-everywhere",
      contributes: "filters.FixtureRow",
      compute: () => [
        {
          id: "sweet",
          label: "Sweet",
          predicate: (row) => row.flavour === "sweet",
        },
      ],
    });
    registerContribution({
      id: "fixture-savoury-only-b",
      contributes: "filters.FixtureRow",
      onlyIn: "widget-b",
      compute: () => [
        {
          id: "savoury",
          label: "Savoury",
          predicate: (row) => row.flavour === "savoury",
        },
      ],
    });

    render(
      <>
        <Widget widgetId="widget-a" />
        <Widget widgetId="widget-b" />
      </>,
    );
    await waitFor(() => {
      // The broad facet lands in both widgets; the narrowed one in B alone.
      expect(screen.getAllByRole("button", { name: "Sweet" })).toHaveLength(2);
      expect(screen.getAllByRole("button", { name: "Savoury" })).toHaveLength(
        1,
      );
    });
  });

  it("renders no filter chrome when nothing has contributed", () => {
    render(<Widget widgetId="widget-a" />);
    expect(screen.queryByRole("button")).toBeNull();
    // The rows still flow through unfiltered.
    expect(screen.getByText("cake")).toBeDefined();
  });
});
