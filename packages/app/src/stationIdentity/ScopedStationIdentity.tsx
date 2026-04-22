import type { ReactNode } from "react";
import { useMemo } from "react";
import { useActiveProfile } from "../saveProfiles";
import { StationIdentityProvider } from "./StationIdentityContext";
import { StationIdentityService } from "./StationIdentityService";

/**
 * Binds the station-identity service to the active save profile. Each
 * profile owns its own station name, so switching profiles swaps the
 * displayed / broadcast name without leaking state between missions.
 */
export function ScopedStationIdentity({ children }: { children: ReactNode }) {
  const profile = useActiveProfile();
  const service = useMemo(
    () => new StationIdentityService(profile.id),
    [profile.id],
  );
  return (
    <StationIdentityProvider service={service}>
      {children}
    </StationIdentityProvider>
  );
}
