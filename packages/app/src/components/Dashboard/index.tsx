import {
  type AnyDef,
  AppError,
  DashboardItemContext,
  getComponent,
  handleError,
} from "@gonogo/core";
import { Tabs, useModal } from "@gonogo/ui";
import { forwardRef, useCallback, useImperativeHandle, useState } from "react";
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
// Persistence helpers
// ---------------------------------------------------------------------------

interface PersistedState {
  items: DashboardItem[];
  layouts: Layouts;
}

function loadState(key: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function saveState(key: string, state: PersistedState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

interface DashboardProps {
  config: DashboardConfig;
  storageKey?: string;
  onLayoutChange?: (layouts: Layouts) => void;
}

export interface DashboardHandle {
  addItem: (item: DashboardItem, layout: Partial<Layout>) => void;
  currentLayouts: Layouts;
}

export const Dashboard = forwardRef<DashboardHandle, DashboardProps>(
  function Dashboard({ config, storageKey, onLayoutChange }, ref) {
    const saved = storageKey ? loadState(storageKey) : null;

    const [items, setItems] = useState<DashboardItem[]>(
      saved?.items ?? config.items,
    );
    const [layouts, setLayouts] = useState<Layouts>(
      saved?.layouts ?? config.layouts,
    );
    const [breakpoint, setBreakpoint] = useState<string>("lg");
    const [currentLayouts, setCurrentLayouts] = useState<Layouts>(
      saved?.layouts ?? config.layouts,
    );

    const persist = useCallback(
      (nextItems: DashboardItem[], nextLayouts: Layouts) => {
        if (storageKey)
          saveState(storageKey, { items: nextItems, layouts: nextLayouts });
      },
      [storageKey],
    );

    function handleLayoutChange(_current: Layout[], all: Layouts) {
      setCurrentLayouts(all);
      setLayouts(all);
      persist(items, all);
      onLayoutChange?.(all);
    }

    function handleBreakpointChange(bp: string) {
      setBreakpoint(bp);
    }

    const updateItemConfig = useCallback(
      (itemId: string, newConfig: Record<string, unknown>) => {
        setItems((prev) => {
          const next = prev.map((it) =>
            it.i === itemId ? { ...it, config: newConfig } : it,
          );
          persist(next, layouts);
          return next;
        });
      },
      [layouts, persist],
    );

    const updateItemMappings = useCallback(
      (itemId: string, next: InputMappings) => {
        setItems((prev) => {
          const updated = prev.map((it) =>
            it.i === itemId ? { ...it, inputMappings: next } : it,
          );
          persist(updated, layouts);
          return updated;
        });
      },
      [layouts, persist],
    );

    /** Exposed for the component-selection overlay (T41). */
    const addItem = useCallback(
      (item: DashboardItem, layout: Partial<Layout>) => {
        setItems((prev) => {
          const next = [...prev, item];
          const entry: Layout = {
            i: item.i,
            x: layout.x ?? 0,
            y: layout.y ?? 9999,
            w: layout.w ?? 3,
            h: layout.h ?? 3,
            ...layout,
          };
          const nextLayouts = Object.fromEntries(
            Object.keys(COLS).map((bp) => [
              bp,
              [...(currentLayouts[bp] ?? []), entry],
            ]),
          );
          persist(next, nextLayouts);
          setLayouts(nextLayouts);
          return next;
        });
      },
      [currentLayouts, persist],
    );

    // Expose addItem and currentLayouts to parent via ref
    useImperativeHandle(ref, () => ({ addItem, currentLayouts }), [
      addItem,
      currentLayouts,
    ]);

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
        onBreakpointChange={handleBreakpointChange}
      >
        {items.map((item) => {
          const def = getComponent(item.componentId);
          if (!def) return null;
          const Comp = def.component;

          // Derive current w/h from the active breakpoint layout
          const bpLayouts =
            currentLayouts[breakpoint] ?? currentLayouts.lg ?? [];
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
                      onSaveMappings={(next) =>
                        updateItemMappings(item.i, next)
                      }
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
  },
);

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

// Content rendered inside the modal. Split out so `useState` can live here
// (the outer `GearButton` only needs to open a modal, not track tab state).
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
