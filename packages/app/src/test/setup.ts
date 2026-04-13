import '@testing-library/jest-dom';
import '@testing-library/react'; // ensures IS_REACT_ACT_ENVIRONMENT is set before any test runs

// ResizeObserver is not available in jsdom — provide a no-op stub so components
// that use it (e.g. MapView) don't throw during tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
