import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { PushedWidget, PushHostService } from "./PushHostService";

const PushHostContext = createContext<PushHostService | null>(null);

export function PushHostProvider({
  service,
  children,
}: {
  service: PushHostService;
  children: ReactNode;
}) {
  return (
    <PushHostContext.Provider value={service}>
      {children}
    </PushHostContext.Provider>
  );
}

/** The aggregator, or null on screens that don't provide one (stations). */
export function usePushHost(): PushHostService | null {
  return useContext(PushHostContext);
}

/** Reactive snapshot of pushed widgets. Empty array when no provider. */
export function usePushedWidgets(): PushedWidget[] {
  const service = usePushHost();
  const [widgets, setWidgets] = useState<PushedWidget[]>(() =>
    service ? service.snapshot() : [],
  );
  useEffect(() => {
    if (!service) {
      setWidgets([]);
      return;
    }
    setWidgets(service.snapshot());
    return service.onChange(setWidgets);
  }, [service]);
  return widgets;
}
