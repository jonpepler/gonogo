import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Thrower({ msg }: { msg: string }) {
  throw new Error(msg);
}

describe("ErrorBoundary", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs the caught error regardless of our handler; silence it so
    // the test output stays clean without hiding genuine failures.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders children when no error is thrown", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <div>safe content</div>
      </ErrorBoundary>,
    );
    expect(getByText("safe content")).not.toBeNull();
  });

  it("renders the default message when no fallback is provided", () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Thrower msg="boom" />
      </ErrorBoundary>,
    );
    expect(getByText("Something went wrong.")).not.toBeNull();
  });

  it("calls the fallback with the caught error and a reset handler", () => {
    const fallback = vi.fn((error: Error) => <div>caught: {error.message}</div>);

    const { getByText } = render(
      <ErrorBoundary fallback={fallback}>
        <Thrower msg="kaboom" />
      </ErrorBoundary>,
    );

    expect(getByText("caught: kaboom")).not.toBeNull();
    expect(fallback).toHaveBeenCalled();
    const [error, reset] = fallback.mock.calls[0];
    expect(error.message).toBe("kaboom");
    expect(typeof reset).toBe("function");
  });
});
