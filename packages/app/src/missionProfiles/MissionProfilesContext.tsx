import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type {
  MissionProfile,
  MissionProfilesService,
} from "./MissionProfilesService";

const MissionProfilesContext = createContext<MissionProfilesService | null>(
  null,
);

export function MissionProfilesProvider({
  service,
  children,
}: {
  service: MissionProfilesService;
  children: ReactNode;
}) {
  return (
    <MissionProfilesContext.Provider value={service}>
      {children}
    </MissionProfilesContext.Provider>
  );
}

export function useMissionProfilesService(): MissionProfilesService {
  const svc = useContext(MissionProfilesContext);
  if (!svc) {
    throw new Error(
      "useMissionProfilesService must be used inside <MissionProfilesProvider>",
    );
  }
  return svc;
}

/** Reactive snapshot of the current profile list. */
export function useMissionProfiles(): readonly MissionProfile[] {
  const svc = useMissionProfilesService();
  const [profiles, setProfiles] = useState(() => svc.list());
  useEffect(() => svc.subscribe(() => setProfiles(svc.list())), [svc]);
  return profiles;
}
