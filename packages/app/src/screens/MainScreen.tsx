import { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { getDataSources } from '@gonogo/core';
import { Dashboard } from '../components/Dashboard';
import type { DashboardConfig, DashboardHandle } from '../components/Dashboard';
import { ComponentOverlay, OverlayProvider } from '../components/ComponentOverlay';

// ---------------------------------------------------------------------------
// Demo layout
// ---------------------------------------------------------------------------

const DEMO_CONFIG: DashboardConfig = {
  items: [
    { i: 'status',    componentId: 'data-source-status' },
    { i: 'ag-sas',   componentId: 'action-group', config: { actionGroupId: 'SAS' } },
    { i: 'ag-rcs',   componentId: 'action-group', config: { actionGroupId: 'RCS' } },
    { i: 'ag-gear',  componentId: 'action-group', config: { actionGroupId: 'Gear' } },
    { i: 'ag-brake', componentId: 'action-group', config: { actionGroupId: 'Brake' } },
    { i: 'ag-light', componentId: 'action-group', config: { actionGroupId: 'Light' } },
    { i: 'ag-ag1',   componentId: 'action-group', config: { actionGroupId: 'AG1' } },
    { i: 'orbit',    componentId: 'current-orbit' },
    { i: 'orbit-view', componentId: 'orbit-view' },
    { i: 'target',   componentId: 'distance-to-target' },
    { i: 'map',      componentId: 'map-view' },
    { i: 'kos',      componentId: 'kos-terminal' },
    { i: 'kos-ro',   componentId: 'kos-terminal', config: { readOnly: true, cpuName: 'system' } },
  ],
  layouts: {
    lg: [
      { i: 'status',    x: 0,  y: 0,  w: 12, h: 1 },
      { i: 'ag-sas',   x: 0,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-rcs',   x: 2,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-gear',  x: 4,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-brake', x: 6,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-light', x: 8,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-ag1',   x: 10, y: 1,  w: 2,  h: 2 },
      { i: 'orbit',    x: 0,  y: 3,  w: 3,  h: 6 },
      { i: 'orbit-view', x: 3, y: 3, w: 3,  h: 6 },
      { i: 'target',   x: 6,  y: 3,  w: 2,  h: 3 },
      { i: 'map',      x: 8,  y: 3,  w: 4,  h: 6 },
      { i: 'kos',      x: 0,  y: 9,  w: 6,  h: 5 },
      { i: 'kos-ro',   x: 6,  y: 9,  w: 6,  h: 5 },
    ],
    md: [
      { i: 'status',    x: 0,  y: 0,  w: 10, h: 1 },
      { i: 'ag-sas',   x: 0,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-rcs',   x: 2,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-gear',  x: 4,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-brake', x: 6,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-light', x: 8,  y: 1,  w: 2,  h: 2 },
      { i: 'ag-ag1',   x: 0,  y: 3,  w: 2,  h: 2 },
      { i: 'orbit',    x: 0,  y: 5,  w: 4,  h: 6 },
      { i: 'orbit-view', x: 4, y: 5, w: 3,  h: 6 },
      { i: 'target',   x: 7,  y: 5,  w: 3,  h: 3 },
      { i: 'map',      x: 0,  y: 11, w: 10, h: 5 },
      { i: 'kos',      x: 0,  y: 16, w: 5,  h: 5 },
      { i: 'kos-ro',   x: 5,  y: 16, w: 5,  h: 5 },
    ],
    sm: [
      { i: 'status',    x: 0, y: 0,  w: 6, h: 1 },
      { i: 'ag-sas',   x: 0, y: 1,  w: 2, h: 2 },
      { i: 'ag-rcs',   x: 2, y: 1,  w: 2, h: 2 },
      { i: 'ag-gear',  x: 4, y: 1,  w: 2, h: 2 },
      { i: 'ag-brake', x: 0, y: 3,  w: 2, h: 2 },
      { i: 'ag-light', x: 2, y: 3,  w: 2, h: 2 },
      { i: 'ag-ag1',   x: 4, y: 3,  w: 2, h: 2 },
      { i: 'orbit',    x: 0, y: 5,  w: 3, h: 6 },
      { i: 'orbit-view', x: 3, y: 5, w: 3, h: 6 },
      { i: 'target',   x: 0, y: 11, w: 3, h: 3 },
      { i: 'map',      x: 0, y: 14, w: 6, h: 5 },
      { i: 'kos',      x: 0, y: 19, w: 6, h: 5 },
      { i: 'kos-ro',   x: 0, y: 24, w: 6, h: 5 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function MainScreen() {
  const dashboardRef = useRef<DashboardHandle>(null);

  useEffect(() => {
    const sources = getDataSources();
    sources.forEach((s) => { void s.connect(); });
    return () => { sources.forEach((s) => s.disconnect()); };
  }, []);

  const addItem: OverlayProvider_AddItem = (item, layout) => {
    dashboardRef.current?.addItem(item, layout);
  };

  const currentLayouts = dashboardRef.current?.currentLayouts ?? { lg: [] };

  return (
    <OverlayProvider addItem={addItem}>
      <Layout>
        <Dashboard ref={dashboardRef} config={DEMO_CONFIG} storageKey="gonogo:dashboard:main" />
        <ComponentOverlay currentLayouts={currentLayouts} />
      </Layout>
    </OverlayProvider>
  );
}

// Inline type alias to avoid importing DashboardItem directly here
type OverlayProvider_AddItem = (
  item: import('../components/Dashboard').DashboardItem,
  layout: { x: number; y: number; w: number; h: number },
) => void;

const Layout = styled.div`
  padding: 24px;
  background: #050505;
  min-height: 100vh;
`;
