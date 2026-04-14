import styled from 'styled-components';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layouts, Layout } from 'react-grid-layout';
import { getComponent } from '@gonogo/core';
import 'react-grid-layout/css/styles.css';
import '../styles/react-resizable.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardItem {
  /** Unique instance ID — used as the react-grid-layout key. */
  i: string;
  /** ID matching a registered component (via registerComponent). */
  componentId: string;
  /** Per-instance component config passed as the `config` prop. */
  config?: Record<string, unknown>;
}

export interface DashboardConfig {
  items: DashboardItem[];
  /**
   * Per-breakpoint layouts in react-grid-layout format.
   * Keys: lg | md | sm | xs | xxs
   */
  layouts: Layouts;
}

// ---------------------------------------------------------------------------
// Grid constants
// ---------------------------------------------------------------------------

const COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 80; // px per grid unit

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface DashboardProps {
  config: DashboardConfig;
  storageKey?: string;
  onLayoutChange?: (layouts: Layouts) => void;
}

export function Dashboard({ config, storageKey, onLayoutChange }: DashboardProps) {
  // Load persisted layouts from localStorage (merged over the default config)
  const savedLayouts = storageKey ? loadLayouts(storageKey) : null;
  const layouts = savedLayouts ?? config.layouts;

  function handleLayoutChange(_current: Layout[], all: Layouts) {
    if (storageKey) saveLayouts(storageKey, all);
    onLayoutChange?.(all);
  }

  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layouts={layouts}
      breakpoints={BREAKPOINTS}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      margin={[8, 8]}
      containerPadding={[0, 0]}
      draggableHandle=".drag-handle"
      onLayoutChange={handleLayoutChange}
    >
      {config.items.map((item) => {
        const def = getComponent(item.componentId);
        if (!def) return null;
        const Comp = def.component;
        return (
          <GridCell key={item.i}>
            <DragHandle className="drag-handle" title="Drag to reposition" />
            <ComponentWrapper>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <Comp config={item.config as any} />
            </ComponentWrapper>
          </GridCell>
        );
      })}
    </ResponsiveGridLayout>
  );
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function loadLayouts(key: string): Layouts | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Layouts) : null;
  } catch {
    return null;
  }
}

function saveLayouts(key: string, layouts: Layouts): void {
  try {
    localStorage.setItem(key, JSON.stringify(layouts));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const GridCell = styled.div`
  display: flex;
  flex-direction: column;
  background: transparent;
  overflow: hidden;
`;

const DragHandle = styled.div`
  height: 6px;
  background: #1a1a1a;
  cursor: grab;
  flex-shrink: 0;
  border-radius: 2px 2px 0 0;

  &:hover {
    background: #2a2a2a;
  }

  &:active {
    cursor: grabbing;
  }
`;

const ComponentWrapper = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;
