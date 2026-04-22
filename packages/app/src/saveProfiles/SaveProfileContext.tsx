import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { SaveProfile, SaveProfileService } from "./SaveProfileService";

const SaveProfileContext = createContext<SaveProfileService | null>(null);

export function SaveProfileProvider({
  service,
  children,
}: {
  service: SaveProfileService;
  children: ReactNode;
}) {
  return (
    <SaveProfileContext.Provider value={service}>
      {children}
    </SaveProfileContext.Provider>
  );
}

export function useSaveProfileService(): SaveProfileService {
  const svc = useContext(SaveProfileContext);
  if (!svc) {
    throw new Error(
      "useSaveProfileService must be used inside a <SaveProfileProvider>.",
    );
  }
  return svc;
}

export function useSaveProfiles(): SaveProfile[] {
  const svc = useSaveProfileService();
  const [snapshot, setSnapshot] = useState(() => svc.getAll());
  useEffect(() => svc.onProfilesChange(() => setSnapshot(svc.getAll())), [svc]);
  return snapshot;
}

export function useActiveProfile(): SaveProfile {
  const svc = useSaveProfileService();
  const [snapshot, setSnapshot] = useState(() => svc.getActive());
  useEffect(() => {
    const unsubActive = svc.onActiveChange(() => setSnapshot(svc.getActive()));
    const unsubProfiles = svc.onProfilesChange(() =>
      setSnapshot(svc.getActive()),
    );
    return () => {
      unsubActive();
      unsubProfiles();
    };
  }, [svc]);
  return snapshot;
}
