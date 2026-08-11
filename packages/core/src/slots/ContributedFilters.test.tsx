import type { FilterEntry } from "@ksp-gonogo/sitrep-sdk";
import { fireEvent, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { WidgetMetaContext } from "../contexts/WidgetMetaContext";
import { clearContributions, registerContribution } from "../contributions";
import { ContributedFilters } from "./ContributedFilters";

// The component-led slot end to end: the WIDGET below writes no slot id,
// lists nothing, and reads no contributions; it mounts the component around
// its rows and renders what comes back. The slot exists because the
// component is there.

interface Row {
  id: string;
  colour: string;
}

declare module "../contributions" {
  interface ContributionRegistry {
    "fixture-panel.filters": {
      entry: FilterEntry<Row>;
      topics: never;
    };
  }
}

const ROWS: Row[] = [
  { id: "a", colour: "red" },
  { id: "b", colour: "blue" },
];

beforeEach(() => {
  clearContributions();
});

function FixturePanel() {
  return (
    <ContributedFilters items={ROWS} allLabel="All rows">
      {(filtered) => (
        <ul>
          {filtered.map((row) => (
            <li key={row.id}>{`row:${row.id}`}</li>
          ))}
        </ul>
      )}
    </ContributedFilters>
  );
}

function renderInWidget() {
  return render(
    <WidgetMetaContext.Provider
      value={{ componentId: "fixture-panel", contributionSlots: [] }}
    >
      <FixturePanel />
    </WidgetMetaContext.Provider>,
  );
}

function registerColourFilter(): void {
  registerContribution({
    id: "colours",
    contributes: "fixture-panel.filters",
    compute: () => [
      {
        id: "red",
        label: "red",
        group: "colour",
        groupLabel: "Colour",
        predicate: (row: Row) => row.colour === "red",
      },
    ],
  });
}

async function visibleRows(): Promise<string[]> {
  const items = await screen.findAllByRole("listitem");
  return items.map((item) => item.textContent ?? "");
}

describe("ContributedFilters", () => {
  it("aggregates from mounting alone: no contributionSlots listing anywhere", async () => {
    registerColourFilter();
    renderInWidget();

    fireEvent.click(await screen.findByRole("button", { name: "red" }));
    await waitFor(async () => expect(await visibleRows()).toEqual(["row:a"]));
  });

  it("renders no filter chrome until something contributes", async () => {
    renderInWidget();

    expect(await visibleRows()).toEqual(["row:a", "row:b"]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("passes items through unfiltered outside a widget (no slot exists)", async () => {
    registerColourFilter();
    render(<FixturePanel />);

    // The contribution targets fixture-panel.filters, but with no
    // WidgetMetaContext there is no slot to complete, so nothing arrives
    // and nothing is hidden.
    expect(await visibleRows()).toEqual(["row:a", "row:b"]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("picks up a contribution registered after mount", async () => {
    renderInWidget();
    expect(await visibleRows()).toEqual(["row:a", "row:b"]);

    registerColourFilter();
    fireEvent.click(await screen.findByRole("button", { name: "red" }));
    await waitFor(async () => expect(await visibleRows()).toEqual(["row:a"]));
  });
});
