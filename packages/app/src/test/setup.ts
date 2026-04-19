import "@testing-library/jest-dom";
import "@testing-library/react"; // ensures IS_REACT_ACT_ENVIRONMENT is set before any test runs

// ResizeObserver is not available in jsdom — provide a no-op stub so components
// that use it (e.g. MapView) don't throw during tests.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom doesn't implement HTMLCanvasElement.getContext — it logs a loud
// "Not implemented" warning to stderr every time a canvas mounts. We don't
// need real canvas rendering in these tests; return null so callers take
// their "no context available" path. (The `canvas` npm package would work
// but brings a native build dep we don't want.)
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}
