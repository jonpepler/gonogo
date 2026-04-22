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
import type { DashboardConfig } from "../components/Dashboard";
import { Dashboard } from "../components/Dashboard";
import { useDashboardState } from "../components/Dashboard/useDashboardState";
import { SignalLossIndicator } from "../components/SignalLossIndicator";
import { StationLinkFab } from "../components/StationLinkFab";
import { GoNoGoHostProvider, GoNoGoHostService } from "../goNoGo";
import { peerHostService } from "../peer/PeerHostService";
import {
  SaveProfileProvider,
  SaveProfileService,
  SaveProfilesFab,
  useActiveProfile,
} from "../saveProfiles";

const DEMO_CONFIG: DashboardConfig = {
  items: [
    { i: "status", componentId: "data-source-status" },
    {
      i: "ag-sas",
      componentId: "action-group",
      config: { actionGroupId: "SAS" },
    },
    {
      i: "ag-rcs",
      componentId: "action-group",
      config: { actionGroupId: "RCS" },
    },
    {
      i: "ag-gear",
      componentId: "action-group",
      config: { actionGroupId: "Gear" },
    },
    {
      i: "ag-brake",
      componentId: "action-group",
      config: { actionGroupId: "Brake" },
    },
    {
      i: "ag-light",
      componentId: "action-group",
      config: { actionGroupId: "Light" },
    },
    {
      i: "ag-ag1",
      componentId: "action-group",
      config: { actionGroupId: "AG1" },
    },
    { i: "orbit", componentId: "current-orbit" },
    { i: "orbit-view", componentId: "orbit-view" },
    { i: "target", componentId: "distance-to-target" },
    { i: "map", componentId: "map-view" },
    { i: "kos", componentId: "kos-terminal" },
    {
      i: "kos-ro",
      componentId: "kos-terminal",
      config: { readOnly: true, cpuName: "system" },
    },
  ],

  layouts: {
    lg: [
      {
        w: 8,
        h: 6,
        x: 0,
        y: 0,
        i: "status",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 8,
        y: 3,
        i: "ag-sas",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 11,
        y: 3,
        i: "ag-rcs",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 14,
        y: 0,
        i: "ag-gear",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 14,
        y: 3,
        i: "ag-brake",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 8,
        y: 0,
        i: "ag-light",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 11,
        y: 0,
        i: "ag-ag1",
        moved: false,
        static: false,
      },
      {
        w: 5,
        h: 6,
        x: 17,
        y: 0,
        i: "orbit",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 6,
        x: 22,
        y: 0,
        i: "orbit-view",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 6,
        y: 24,
        i: "target",
        moved: false,
        static: false,
      },
      {
        w: 26,
        h: 18,
        x: 0,
        y: 6,
        i: "map",
        moved: false,
        static: false,
      },
      {
        w: 10,
        h: 24,
        x: 26,
        y: 0,
        i: "kos",
        moved: false,
        static: false,
      },
      {
        w: 24,
        h: 16,
        x: 6,
        y: 27,
        i: "kos-ro",
        moved: false,
        static: false,
      },
    ],
    md: [
      {
        w: 8,
        h: 5,
        x: 0,
        y: 0,
        i: "status",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 0,
        y: 5,
        i: "ag-sas",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 4,
        y: 11,
        i: "ag-rcs",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 4,
        y: 5,
        i: "ag-gear",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 4,
        y: 8,
        i: "ag-brake",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 0,
        y: 8,
        i: "ag-light",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 3,
        x: 0,
        y: 11,
        i: "ag-ag1",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 6,
        x: 0,
        y: 14,
        i: "orbit",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 6,
        x: 4,
        y: 14,
        i: "orbit-view",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 4,
        x: 4,
        y: 20,
        i: "target",
        moved: false,
        static: false,
      },
      {
        w: 22,
        h: 12,
        x: 8,
        y: 0,
        i: "map",
        moved: false,
        static: false,
      },
      {
        w: 22,
        h: 12,
        x: 8,
        y: 12,
        i: "kos",
        moved: false,
        static: false,
      },
      {
        w: 4,
        h: 4,
        x: 0,
        y: 20,
        i: "kos-ro",
        moved: false,
        static: false,
      },
    ],
    sm: [
      {
        w: 6,
        h: 4,
        x: 0,
        y: 0,
        i: "status",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 0,
        y: 4,
        i: "ag-sas",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 0,
        y: 10,
        i: "ag-rcs",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 3,
        y: 4,
        i: "ag-gear",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 0,
        y: 7,
        i: "ag-brake",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 3,
        y: 10,
        i: "ag-light",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 3,
        y: 7,
        i: "ag-ag1",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 6,
        x: 0,
        y: 13,
        i: "orbit",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 6,
        x: 3,
        y: 13,
        i: "orbit-view",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 4,
        x: 0,
        y: 19,
        i: "target",
        moved: false,
        static: false,
      },
      {
        w: 12,
        h: 10,
        x: 6,
        y: 0,
        i: "map",
        moved: false,
        static: false,
      },
      {
        w: 12,
        h: 13,
        x: 6,
        y: 10,
        i: "kos",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 5,
        x: 0,
        y: 23,
        i: "kos-ro",
        moved: false,
        static: false,
      },
    ],
    xs: [
      {
        w: 6,
        h: 4,
        x: 0,
        y: 0,
        i: "status",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 6,
        y: 0,
        i: "ag-sas",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 8,
        y: 0,
        i: "ag-rcs",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 10,
        y: 0,
        i: "ag-gear",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 6,
        y: 3,
        i: "ag-brake",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 8,
        y: 3,
        i: "ag-light",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 10,
        y: 3,
        i: "ag-ag1",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 6,
        x: 0,
        y: 4,
        i: "orbit",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 9,
        x: 3,
        y: 4,
        i: "orbit-view",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 3,
        x: 0,
        y: 10,
        i: "target",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 7,
        x: 6,
        y: 6,
        i: "map",
        moved: false,
        static: false,
      },
      {
        w: 12,
        h: 14,
        x: 0,
        y: 13,
        i: "kos",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 5,
        x: 0,
        y: 27,
        i: "kos-ro",
        moved: false,
        static: false,
      },
    ],
    xxs: [
      {
        w: 6,
        h: 4,
        x: 0,
        y: 0,
        i: "status",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 0,
        y: 4,
        i: "ag-sas",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 2,
        y: 4,
        i: "ag-rcs",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 4,
        y: 4,
        i: "ag-gear",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 0,
        y: 7,
        i: "ag-brake",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 2,
        y: 7,
        i: "ag-light",
        moved: false,
        static: false,
      },
      {
        w: 2,
        h: 3,
        x: 4,
        y: 7,
        i: "ag-ag1",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 6,
        x: 0,
        y: 18,
        i: "orbit",
        moved: false,
        static: false,
      },
      {
        w: 3,
        h: 6,
        x: 3,
        y: 18,
        i: "orbit-view",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 4,
        x: 0,
        y: 24,
        i: "target",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 8,
        x: 0,
        y: 10,
        i: "map",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 9,
        x: 0,
        y: 28,
        i: "kos",
        moved: false,
        static: false,
      },
      {
        w: 6,
        h: 5,
        x: 0,
        y: 37,
        i: "kos-ro",
        moved: false,
        static: false,
      },
    ],
  },
};

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
          <ScopedFogMaskCache store={fogMaskStore}>
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
                  </FabClusterProvider>
                  <SignalLossIndicator />
                </Layout>
              </OverlayProvider>
            </SerialDeviceProvider>
          </ScopedFogMaskCache>
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
