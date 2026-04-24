import { getDataSources, getStreamSources, ScreenProvider } from "@gonogo/core";
import { FlightsFab, FogMaskCacheProvider, FogMaskStore } from "@gonogo/data";
import {
  InputDispatcher,
  SerialDeviceProvider,
  SerialDeviceService,
  SerialFab,
} from "@gonogo/serial";
import { FabClusterProvider } from "@gonogo/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  ComponentOverlay,
  OverlayProvider,
} from "../components/ComponentOverlay";
import { Dashboard } from "../components/Dashboard";
import { useDashboardState } from "../components/Dashboard/useDashboardState";
import { FullscreenFab } from "../components/FullscreenFab";
import { SignalLossIndicator } from "../components/SignalLossIndicator";
import { StationLinkFab } from "../components/StationLinkFab";
import { GoNoGoHostProvider, GoNoGoHostService } from "../goNoGo";
import { LogsFab } from "../logs/LogsFab";
import { peerHostService } from "../peer/PeerHostService";
import { PushedDashboardOverlay } from "../pushToMain/PushedDashboardOverlay";
import { PushHostProvider } from "../pushToMain/PushHostContext";
import { PushHostService } from "../pushToMain/PushHostService";
import {
  SaveProfileProvider,
  SaveProfileService,
  SaveProfilesFab,
  useActiveProfile,
} from "../saveProfiles";
import { DEMO_CONFIG } from "./demoConfig";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function MainScreen() {
  const dashboard = useDashboardState("gonogo:dashboard:main", DEMO_CONFIG);
  const [serialService] = useState(
    () => new SerialDeviceService({ screenKey: "main" }),
  );
  const [saveProfileService] = useState(() => new SaveProfileService());
  const [fogMaskStore] = useState(() => new FogMaskStore());
  // GoNoGoHostService lives for the app's lifetime. Intentionally no dispose
  // cleanup — StrictMode's simulated unmount would run it and leave the
  // second mount with a zombie service that no longer receives host events
  // (the useState initializer only runs once per mount cycle).
  const [goNoGoHost] = useState(() => new GoNoGoHostService(peerHostService));
  const [pushHost] = useState(() => new PushHostService(peerHostService));

  useEffect(() => {
    const dispatcher = new InputDispatcher({
      service: serialService,
      getItems: dashboard.getItems,
    });
    return () => {
      dispatcher.dispose();
    };
  }, [serialService, dashboard.getItems]);

  useEffect(() => {
    // Auto-reopen previously-authorised serial ports on load. Silent no-op
    // on browsers without Web Serial, or when there are no saved devices.
    void serialService.autoReconnect();
  }, [serialService]);

  useEffect(() => {
    const sources = getDataSources();
    sources.forEach((s) => {
      void s.connect();
    });
    const streamSources = getStreamSources();
    streamSources.forEach((s) => {
      void s.connect();
    });
    return () => {
      sources.forEach((s) => {
        s.disconnect();
      });
      streamSources.forEach((s) => {
        s.disconnect();
      });
    };
  }, []);

  return (
    <ScreenProvider value="main">
      <SaveProfileProvider service={saveProfileService}>
        <GoNoGoHostProvider service={goNoGoHost}>
          <PushHostProvider service={pushHost}>
            <ScopedFogMaskCache store={fogMaskStore}>
              <SerialDeviceProvider service={serialService}>
                <OverlayProvider
                  addItem={dashboard.addItem}
                  updateItemConfig={dashboard.updateItemConfig}
                >
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
                      removeItem={dashboard.removeItem}
                    />
                    <FabClusterProvider>
                      <ComponentOverlay
                        currentLayouts={dashboard.currentLayouts}
                      />
                      <FlightsFab />
                      <SerialFab />
                      <StationLinkFab />
                      <SaveProfilesFab />
                      <LogsFab />
                      <FullscreenFab />
                    </FabClusterProvider>
                    <SignalLossIndicator />
                    <PushedDashboardOverlay />
                  </Layout>
                </OverlayProvider>
              </SerialDeviceProvider>
            </ScopedFogMaskCache>
          </PushHostProvider>
        </GoNoGoHostProvider>
      </SaveProfileProvider>
    </ScreenProvider>
  );
}

// Thin adapter that reads the active profile from the save-profile context
// and re-binds the fog cache to it. Lives here rather than in @gonogo/data
// so the data package stays ignorant of save-profile concerns.
function ScopedFogMaskCache({
  store,
  children,
}: {
  store: FogMaskStore;
  children: ReactNode;
}) {
  const profile = useActiveProfile();
  return (
    <FogMaskCacheProvider store={store} profileId={profile.id}>
      {children}
    </FogMaskCacheProvider>
  );
}

const Layout = styled.div`
  padding: 24px;
  background: #050505;
  min-height: 100vh;
`;
