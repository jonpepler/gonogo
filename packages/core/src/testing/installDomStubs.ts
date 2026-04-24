/**
 * Shared jsdom shims used by component/widget tests across the monorepo.
 *
 * jsdom omits several browser APIs that our widgets call at mount time. The
 * options are either to crash, to gate every caller behind `typeof`, or to
 * stub here once — stubbing wins. Each shim is idempotent so setup files can
 * call `installDomStubs()` unconditionally.
 */
export function installDomStubs(): void {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.ResizeObserver === "undefined"
  ) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // jsdom prints a loud "Not implemented" warning every time a canvas mounts.
  // Widgets use it to test for 2d support and gracefully degrade; returning
  // null routes them onto that path.
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = () => null;
  }

  // HTMLMediaElement.play is undefined in jsdom; code that awaits it (or
  // chains .catch) explodes. A resolved Promise keeps the await-chain quiet
  // without pretending the video actually played.
  if (typeof HTMLMediaElement !== "undefined") {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  }
}
