import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalProvider, useModal } from "./Modal";

function Opener({ onOpen }: { onOpen: (id: string) => void }) {
  const { open } = useModal();
  return (
    <button
      type="button"
      onClick={() => {
        const id = open(<p>body</p>, { title: "Demo" });
        onOpen(id);
      }}
    >
      open
    </button>
  );
}

describe("Modal", () => {
  it("closes on Escape — the only keyboard-accessible close path", () => {
    const onOpen = vi.fn();
    render(
      <ModalProvider>
        <Opener onOpen={onOpen} />
      </ModalProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the backdrop is clicked", () => {
    const onOpen = vi.fn();
    render(
      <ModalProvider>
        <Opener onOpen={onOpen} />
      </ModalProvider>,
    );
    fireEvent.click(screen.getByText("open"));
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement;
    expect(backdrop).toBeTruthy();
    if (backdrop) fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
