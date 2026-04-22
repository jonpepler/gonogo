import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { PeerClientService } from "./PeerClientService";

const PeerClientContext = createContext<PeerClientService | null>(null);

export function PeerClientProvider({
  client,
  children,
}: {
  client: PeerClientService;
  children: ReactNode;
}) {
  return (
    <PeerClientContext.Provider value={client}>
      {children}
    </PeerClientContext.Provider>
  );
}

/**
 * Access the station's peer client. Returns null on the main screen (or
 * any tree without a provider), so components can branch on "am I a station
 * with peer access?" without crashing.
 */
export function usePeerClient(): PeerClientService | null {
  return useContext(PeerClientContext);
}
