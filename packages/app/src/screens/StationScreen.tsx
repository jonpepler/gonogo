import { debugPeer, KosProxyContext, registerDataSource } from "@gonogo/core";
import { FlightsFab } from "@gonogo/data";
import {
  InputDispatcher,
  SerialDeviceProvider,
  SerialDeviceService,
  SerialFab,
} from "@gonogo/serial";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import {
  ComponentOverlay,
  OverlayProvider,
} from "../components/ComponentOverlay";
import type { DashboardConfig } from "../components/Dashboard";
import { Dashboard } from "../components/Dashboard";
import { useDashboardState } from "../components/Dashboard/useDashboardState";
import { KosPeerConnection } from "../peer/KosPeerConnection";
import { PeerClientDataSource } from "../peer/PeerClientDataSource";
import type { ConnStatus } from "../peer/PeerClientService";
import { PeerClientService } from "../peer/PeerClientService";

const HOST_ID_KEY = "gonogo-station-host-id";

const DEFAULT_CONFIG: DashboardConfig = {
  items: [{ i: "status", componentId: "data-source-status" }],
  layouts: {
    lg: [{ w: 8, h: 6, x: 0, y: 0, i: "status", moved: false, static: false }],
  },
};

export function StationScreen() {
  const [connected, setConnected] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [hostInput, setHostInput] = useState(
    localStorage.getItem(HOST_ID_KEY) ?? "",
  );
  const [client] = useState(() => new PeerClientService());
  const dashboard = useDashboardState(
    "gonogo:dashboard:station",
    DEFAULT_CONFIG,
  );
  const [serialService] = useState(
    () => new SerialDeviceService({ screenKey: "station" }),
  );
  const unsubsRef = useRef<Array<() => void>>([]);
  const schemaHandledRef = useRef(false);

  useEffect(() => {
    const dispatcher = new InputDispatcher({
      service: serialService,
      getItems: dashboard.getItems,
    });
    return () => {
      dispatcher.dispose();
    };
  }, [serialService, dashboard.getItems]);

  function attemptConnect(hostId: string) {
    const trimmed = hostId.trim().toUpperCase();
    if (!trimmed) return;
    localStorage.setItem(HOST_ID_KEY, trimmed);

    debugPeer("StationScreen attemptConnect", {
      host: trimmed,
      listenerCountsBefore: client._listenerCounts(),
    });

    // Drain any prior listeners before (re)registering — otherwise listener
    // Sets on the client grow on every retry / StrictMode cycle.
    unsubsRef.current.forEach((u) => {
      u();
    });
    unsubsRef.current = [];
    schemaHandledRef.current = false;

    unsubsRef.current.push(client.onConnectionStatus(setConnStatus));
    unsubsRef.current.push(
      client.onSchema((sources) => {
        if (schemaHandledRef.current) return;
        schemaHandledRef.current = true;
        for (const s of sources) {
          const source = new PeerClientDataSource(s.id, s.name, client);
          registerDataSource(source);
          void source.connect();
        }
        setConnected(true);
      }),
    );
    client.connect(trimmed);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only — attemptConnect and client are captured once at mount; re-running would cause reconnect loops
  useEffect(() => {
    const savedHost = localStorage.getItem(HOST_ID_KEY);
    if (savedHost) attemptConnect(savedHost);
    return () => {
      unsubsRef.current.forEach((u) => {
        u();
      });
      unsubsRef.current = [];
      client.disconnect();
    };
  }, []);

  const kosProxy = useMemo(
    () => ({
      createConnection: (params: {
        sessionId: string;
        kosHost: string;
        kosPort: number;
        cols: number;
        rows: number;
      }) => new KosPeerConnection(params.sessionId, client, params),
      resize: (sessionId: string, cols: number, rows: number) =>
        client.sendKosResize(sessionId, cols, rows),
    }),
    [client],
  );

  if (!connected) {
    return (
      <ConnectLayout>
        <ConnectBox>
          <h1>Connect to Mission Control</h1>
          <p>Enter the 4-character host ID shown on the main screen.</p>
          <Row>
            <HostInput
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && attemptConnect(hostInput)}
              placeholder="e.g. AB3K"
              maxLength={8}
              autoFocus
            />
            <ConnectButton
              onClick={() => attemptConnect(hostInput)}
              disabled={connStatus === "connecting"}
            >
              {connStatus === "connecting" ? "Connecting…" : "Connect"}
            </ConnectButton>
          </Row>
          {connStatus === "disconnected" && (
            <ErrorMsg>
              Connection lost. Check the host ID and try again.
            </ErrorMsg>
          )}
        </ConnectBox>
      </ConnectLayout>
    );
  }

  return (
    <KosProxyContext.Provider value={kosProxy}>
      <SerialDeviceProvider service={serialService}>
        <OverlayProvider addItem={dashboard.addItem}>
          <Layout>
            <Dashboard
              items={dashboard.items}
              layouts={dashboard.layouts}
              currentLayouts={dashboard.currentLayouts}
              breakpoint={dashboard.breakpoint}
              onLayoutChange={dashboard.handleLayoutChange}
              onBreakpointChange={dashboard.handleBreakpointChange}
              updateItemConfig={dashboard.updateItemConfig}
              updateItemMappings={dashboard.updateItemMappings}
            />
            <ComponentOverlay currentLayouts={dashboard.currentLayouts} />
            <FlightsFab />
            <SerialFab />
          </Layout>
        </OverlayProvider>
      </SerialDeviceProvider>
    </KosProxyContext.Provider>
  );
}

const ConnectLayout = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #050505;
`;

const ConnectBox = styled.div`
  background: #111;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 40px 48px;
  max-width: 420px;
  width: 100%;
  color: #ccc;

  h1 {
    margin: 0 0 8px;
    font-size: 20px;
    color: #fff;
  }

  p {
    margin: 0 0 20px;
    font-size: 13px;
    color: #888;
  }
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
`;

const HostInput = styled.input`
  flex: 1;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 20px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: #7cf;
  font-family: monospace;

  &::placeholder {
    color: #555;
    text-transform: none;
  }

  &:focus {
    outline: none;
    border-color: #7cf;
  }
`;

const ConnectButton = styled.button`
  background: #1a3a5c;
  border: 1px solid #2a5a8c;
  border-radius: 4px;
  padding: 8px 20px;
  color: #7cf;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1e4a74;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const ErrorMsg = styled.p`
  margin-top: 12px !important;
  color: #f87 !important;
  font-size: 12px !important;
`;

const Layout = styled.div`
  padding: 24px;
  background: #050505;
  min-height: 100vh;
`;
