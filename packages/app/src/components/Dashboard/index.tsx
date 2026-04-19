import {
  type AnyDef,
  AppError,
  DashboardItemContext,
  getComponent,
  handleError,
} from "@gonogo/core";
import { Tabs, useModal } from "@gonogo/ui";
import { useState } from "react";
import type { Layout, Layouts } from "react-grid-layout";
import { Responsive, WidthProvider } from "react-grid-layout";
import styled from "styled-components";
import "react-grid-layout/css/styles.css";
import "../../styles/react-resizable.css";
import { type InputMappings, InputMappingTab } from "../InputMappingTab";
import { handleMouseDown } from "./mouseHandlers";

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
  /**
   * Action-id → device input binding. Drives the serial input dispatcher
   * in Phase 4. Missing = unbound; persisted alongside `config`.
   */
  inputMappings?: InputMappings;
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

const COLS = { lg: 36, md: 30, sm: 18, xs: 12, xxs: 6, xxxs: 2 };
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };
const ROW_HEIGHT = 25; // px per grid unit

// ---------------------------------------------------------------------------
// Dashboard — fully controlled. State lives in `useDashboardState` (called
// by the owning screen) so external consumers like the Phase 4 InputDispatcher
// can subscribe to item changes without reaching into Dashboard internals.
// ---------------------------------------------------------------------------

export interface DashboardProps {
  items: DashboardItem[];
  layouts: Layouts;
  currentLayouts: Layouts;
  breakpoint: string;
  onLayoutChange: (current: Layout[], all: Layouts) => void;
  onBreakpointChange: (bp: string) => void;
  updateItemConfig: (id: string, config: Record<string, unknown>) => void;
  updateItemMappings: (id: string, mappings: InputMappings) => void;
}

export function Dashboard({
  items,
  layouts,
  currentLayouts,
  breakpoint,
  onLayoutChange,
  onBreakpointChange,
  updateItemConfig,
  updateItemMappings,
}: Readonly<DashboardProps>) {
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
      onLayoutChange={onLayoutChange}
      onBreakpointChange={onBreakpointChange}
    >
      {items.map((item) => {
        const def = getComponent(item.componentId);
        if (!def) return null;
        const Comp = def.component;

        const bpLayouts = currentLayouts[breakpoint] ?? currentLayouts.lg ?? [];
        const entry = bpLayouts.find((l) => l.i === item.i);
        const w = entry?.w;
        const h = entry?.h;

        const hasConfig = Boolean(def.configComponent);
        const hasActions = Boolean(def.actions?.length);

        return (
          <GridCell key={item.i}>
            <CellHeader className="drag-handle" title="Drag to reposition">
              {(hasConfig || hasActions) && (
                <GearWrapper>
                  <GearButton
                    item={item}
                    def={def}
                    onSaveConfig={(newConfig) =>
                      updateItemConfig(item.i, newConfig)
                    }
                    onSaveMappings={(next) => updateItemMappings(item.i, next)}
                  />
                </GearWrapper>
              )}
            </CellHeader>
            <ComponentWrapper>
              <DashboardItemContext.Provider value={{ instanceId: item.i }}>
                <Comp
                  id={item.i}
                  config={item.config}
                  w={w}
                  h={h}
                  onConfigChange={(newConfig) =>
                    updateItemConfig(item.i, newConfig)
                  }
                />
              </DashboardItemContext.Provider>
            </ComponentWrapper>
          </GridCell>
        );
      })}
    </ResponsiveGridLayout>
  );
}

// ---------------------------------------------------------------------------
// Gear button — separate component so useModal can be called inside the tree
// ---------------------------------------------------------------------------

type GearButtonProps = Readonly<{
  item: DashboardItem;
  def: AnyDef;
  onSaveConfig: (c: Record<string, unknown>) => void;
  onSaveMappings: (m: InputMappings) => void;
}>;

function GearButton({
  item,
  def,
  onSaveConfig,
  onSaveMappings,
}: GearButtonProps) {
  const { open, close } = useModal();
  const ConfigComp = def.configComponent;
  const actions = def.actions ?? [];
  const hasConfig = Boolean(ConfigComp);
  const hasActions = actions.length > 0;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!hasConfig && !hasActions) {
      handleError(new AppError("Nothing to configure"));
      return;
    }
    const id = open(
      <GearModalContent
        item={item}
        def={def}
        onSaveConfig={(c) => {
          onSaveConfig(c);
          close(id);
        }}
        onSaveMappings={(m) => {
          onSaveMappings(m);
          close(id);
        }}
      />,
      { title: def.name },
    );
  }

  return (
    <GearBtn
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      aria-label={`Configure ${def.name}`}
      title="Configure"
    >
      ⚙
    </GearBtn>
  );
}

function GearModalContent({
  item,
  def,
  onSaveConfig,
  onSaveMappings,
}: Readonly<{
  item: DashboardItem;
  def: AnyDef;
  onSaveConfig: (c: Record<string, unknown>) => void;
  onSaveMappings: (m: InputMappings) => void;
}>) {
  const ConfigComp = def.configComponent;
  const actions = def.actions ?? [];
  const hasConfig = Boolean(ConfigComp);
  const hasActions = actions.length > 0;

  const [activeTab, setActiveTab] = useState<"config" | "inputs">(
    hasConfig ? "config" : "inputs",
  );

  if (hasConfig && hasActions && ConfigComp) {
    return (
      <Tabs
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as "config" | "inputs")}
        tabs={[
          {
            id: "config",
            label: "Settings",
            content: (
              <ConfigComp
                config={item.config ?? def.defaultConfig ?? {}}
                onSave={onSaveConfig}
              />
            ),
          },
          {
            id: "inputs",
            label: "Inputs",
            content: (
              <InputMappingTab
                actions={actions}
                mappings={item.inputMappings ?? {}}
                onSave={onSaveMappings}
              />
            ),
          },
        ]}
      />
    );
  }

  if (hasConfig && ConfigComp) {
    return (
      <ConfigComp
        config={item.config ?? def.defaultConfig ?? {}}
        onSave={onSaveConfig}
      />
    );
  }

  return (
    <InputMappingTab
      actions={actions}
      mappings={item.inputMappings ?? {}}
      onSave={onSaveMappings}
    />
  );
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

const CellHeader = styled.div`
  height: 18px;
  background: #111;
  cursor: grab;
  flex-shrink: 0;
  border-radius: 2px 2px 0 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px;

  &:hover {
    background: #1a1a1a;
  }

  &:active {
    cursor: grabbing;
  }
`;

const GearWrapper = styled.div``;

const GearBtn = styled.button`
  pointer-events: all;
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 1px 2px;

  &:hover {
    color: #888;
  }
`;

const ComponentWrapper = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;
