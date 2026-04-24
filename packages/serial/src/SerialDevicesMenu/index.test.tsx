import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SerialDeviceProvider } from "../SerialDeviceContext";
import { SerialDeviceService } from "../SerialDeviceService";
import { SerialDevicesMenu } from "./index";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    length: 0,
    clear: () => map.clear(),
    key: () => null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  } as Storage;
}

describe("SerialDevicesMenu Web Serial support banner", () => {
  let originalSerial: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalSerial = Object.getOwnPropertyDescriptor(navigator, "serial");
  });

  afterEach(() => {
    cleanup();
    if (originalSerial) {
      Object.defineProperty(navigator, "serial", originalSerial);
    } else {
      delete (navigator as Navigator & { serial?: unknown }).serial;
    }
  });

  function renderMenu(): void {
    const svc = new SerialDeviceService({
      screenKey: "test",
      storage: memoryStorage(),
      renderDebounceMs: 0,
    });
    render(
      <SerialDeviceProvider service={svc}>
        <SerialDevicesMenu />
      </SerialDeviceProvider>,
    );
  }

  it("renders the banner when navigator.serial is unavailable", () => {
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: undefined,
    });
    renderMenu();
    expect(screen.getByRole("status").textContent).toMatch(
      /Web Serial is not available/i,
    );
  });

  it("hides the banner when navigator.serial.requestPort exists", () => {
    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: { requestPort: () => Promise.resolve() },
    });
    renderMenu();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
