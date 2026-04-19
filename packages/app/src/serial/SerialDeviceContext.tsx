import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { SerialDeviceService } from "./SerialDeviceService";

const SerialDeviceContext = createContext<SerialDeviceService | null>(null);

export function SerialDeviceProvider({
  service,
  children,
}: {
  service: SerialDeviceService;
  children: ReactNode;
}) {
  return (
    <SerialDeviceContext.Provider value={service}>
      {children}
    </SerialDeviceContext.Provider>
  );
}

export function useSerialDeviceService(): SerialDeviceService {
  const svc = useContext(SerialDeviceContext);
  if (!svc) {
    throw new Error(
      "useSerialDeviceService must be used inside a <SerialDeviceProvider>.",
    );
  }
  return svc;
}

/**
 * Reactive view of the current device instances. Re-renders when devices
 * are added/removed or when an instance's config changes.
 */
export function useSerialDevices() {
  const svc = useSerialDeviceService();
  const [snapshot, setSnapshot] = useState(() => svc.getDevices());
  useEffect(
    () => svc.onDevicesChange(() => setSnapshot(svc.getDevices())),
    [svc],
  );
  return snapshot;
}

/** Reactive view of the registered device types. */
export function useSerialDeviceTypes() {
  const svc = useSerialDeviceService();
  const [snapshot, setSnapshot] = useState(() => svc.getDeviceTypes());
  useEffect(
    () => svc.onDeviceTypesChange(() => setSnapshot(svc.getDeviceTypes())),
    [svc],
  );
  return snapshot;
}

/** Reactive view of a single device's transport status. */
export function useSerialDeviceStatus(deviceId: string) {
  const svc = useSerialDeviceService();
  const [status, setStatus] = useState(() => svc.getStatus(deviceId));
  useEffect(
    () =>
      svc.onStatusChange((id, next) => {
        if (id === deviceId) setStatus(next);
      }),
    [svc, deviceId],
  );
  return status;
}
