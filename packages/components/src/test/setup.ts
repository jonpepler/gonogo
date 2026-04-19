import "@testing-library/jest-dom";

// jsdom doesn't implement HTMLCanvasElement.getContext and prints a loud
// "Not implemented" warning to stderr every time a canvas mounts. Return
// null so callers take their "no context available" path.
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = () => null;
}
