import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataKeyMultiPicker } from "./DataKeyMultiPicker";
import type { KeyOption } from "./DataKeyPicker";

const KEYS: KeyOption[] = [
  { key: "v.altitude", label: "Altitude", unit: "m", group: "Position" },
  { key: "v.lat", label: "Latitude", unit: "°", group: "Position" },
  {
    key: "v.surfaceSpeed",
    label: "Surface speed",
    unit: "m/s",
    group: "Velocity",
  },
  { key: "v.mach", label: "Mach", group: "Velocity" },
];

describe("DataKeyMultiPicker", () => {
  it("renders all keys grouped alphabetically", () => {
    render(
      <DataKeyMultiPicker keys={KEYS} value={new Set()} onChange={() => {}} />,
    );
    expect(screen.getByText("Position")).toBeInTheDocument();
    expect(screen.getByText("Velocity")).toBeInTheDocument();
    expect(screen.getByText("Altitude")).toBeInTheDocument();
    expect(screen.getByText("Mach")).toBeInTheDocument();
  });

  it("shows checked state for keys in the value set", () => {
    render(
      <DataKeyMultiPicker
        keys={KEYS}
        value={new Set(["v.altitude", "v.mach"])}
        onChange={() => {}}
      />,
    );
    expect(
      (document.getElementById("dkmp-v.altitude") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (document.getElementById("dkmp-v.mach") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (document.getElementById("dkmp-v.lat") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("filters by label and key when typing in search", () => {
    render(
      <DataKeyMultiPicker keys={KEYS} value={new Set()} onChange={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "alt" },
    });
    expect(screen.getByText("Altitude")).toBeInTheDocument();
    expect(screen.queryByText("Mach")).not.toBeInTheDocument();
    expect(screen.queryByText("Latitude")).not.toBeInTheDocument();
  });

  it("toggling a row emits a new set with that key added", () => {
    const onChange = vi.fn();
    render(
      <DataKeyMultiPicker
        keys={KEYS}
        value={new Set(["v.lat"])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Altitude/));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(next).sort()).toEqual(["v.altitude", "v.lat"]);
  });

  it("toggling an already-checked row removes that key from the set", () => {
    const onChange = vi.fn();
    render(
      <DataKeyMultiPicker
        keys={KEYS}
        value={new Set(["v.lat", "v.altitude"])}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Latitude/));
    const next = onChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(next)).toEqual(["v.altitude"]);
  });

  it("shows the empty hint when search matches nothing", () => {
    render(
      <DataKeyMultiPicker
        keys={KEYS}
        value={new Set()}
        onChange={() => {}}
        emptyHint="No keys found"
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "xyzzy" },
    });
    expect(screen.getByText("No keys found")).toBeInTheDocument();
  });
});
