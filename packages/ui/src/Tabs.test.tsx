import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "one", label: "One", content: <span>panel-one</span> },
  { id: "two", label: "Two", content: <span>panel-two</span> },
];

describe("Tabs", () => {
  it("renders the active panel and marks its tab selected", () => {
    render(<Tabs tabs={TABS} activeId="one" onChange={() => undefined} />);
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("panel-one")).toBeInTheDocument();
    expect(screen.queryByText("panel-two")).not.toBeInTheDocument();
  });

  it("calls onChange when a different tab is clicked", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={TABS} activeId="one" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(onChange).toHaveBeenCalledWith("two");
  });

  it("switches the visible panel when activeId changes", () => {
    function Harness() {
      const [active, setActive] = useState("one");
      return <Tabs tabs={TABS} activeId={active} onChange={setActive} />;
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("tab", { name: "Two" }));
    expect(screen.getByText("panel-two")).toBeInTheDocument();
    expect(screen.queryByText("panel-one")).not.toBeInTheDocument();
  });

  it("falls back to the first tab when activeId does not match", () => {
    render(<Tabs tabs={TABS} activeId="missing" onChange={() => undefined} />);
    expect(screen.getByText("panel-one")).toBeInTheDocument();
  });
});
