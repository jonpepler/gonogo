import { __setVirtualDeviceServiceAccessor } from "@gonogo/components";
import { useEffect } from "react";
import { useSerialDeviceService } from "./SerialDeviceContext";

/**
 * Wires the VirtualDevice widget's global service accessor to the current
 * screen's SerialDeviceService. The widget lives in @gonogo/components,
 * which can't import @gonogo/app without creating a dependency cycle, so
 * this bridge runs inside the app tree where the real context is available.
 *
 * Call this once inside each screen that mounts a SerialDeviceProvider.
 */
export function useInstallVirtualDeviceAccessor(): void {
  const service = useSerialDeviceService();
  useEffect(() => {
    __setVirtualDeviceServiceAccessor(() => service);
  }, [service]);
}
