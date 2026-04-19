import { getDataSources } from "@gonogo/core";
import {
  InputDispatcher,
  SerialDeviceProvider,
  SerialDeviceService,
  SerialFab,
} from "@gonogo/serial";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  ComponentOverlay,
  OverlayProvider,
} from "../components/ComponentOverlay";
import type { DashboardConfig } from "../components/Dashboard";
import { Dashboard } from "../components/Dashboard";
import { useDashboardState } from "../components/Dashboard/useDashboardState";
import { usePeerHost } from "../peer/PeerHostProvider";

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

function PeerStatusPanel() {
  const { peerId } = usePeerHost();
  if (!peerId) return <PeerStatus>Connecting to peer network…</PeerStatus>;
  return (
    <PeerStatus>
      <p>
        Host ID: <code>{peerId}</code>
      </p>
      <QRCodeSVG value={peerId} size={96} />
    </PeerStatus>
  );
}

export function MainScreen() {
  const dashboard = useDashboardState("gonogo:dashboard:main", DEMO_CONFIG);
  const [serialService] = useState(
    () => new SerialDeviceService({ screenKey: "main" }),
  );

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
    return () => {
      sources.forEach((s) => {
        s.disconnect();
      });
    };
  }, []);

  return (
    <SerialDeviceProvider service={serialService}>
      <OverlayProvider addItem={dashboard.addItem}>
        <Layout>
          <PeerStatusPanel />
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
          <SerialFab />
        </Layout>
      </OverlayProvider>
    </SerialDeviceProvider>
  );
}

const Layout = styled.div`
  padding: 24px;
  background: #050505;
  min-height: 100vh;
`;

const PeerStatus = styled.div`
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 100;
  background: #111;
  border: 1px solid #333;
  border-radius: 6px;
  padding: 10px 14px;
  font-size: 11px;
  color: #aaa;
  line-height: 1.4;

  code {
    color: #7cf;
    font-family: monospace;
  }

  p {
    margin: 0 0 8px;
  }
`;
