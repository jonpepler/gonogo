import { useCallback, useRef, useState } from "react";
import type { Layout, Layouts } from "react-grid-layout";
import type { InputMappings } from "../InputMappingTab";
import type { DashboardConfig, DashboardItem } from "./index";

const COLS_KEYS = ["lg", "md", "sm", "xs", "xxs", "xxxs"] as const;

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
    // quota / private browsing — in-memory state is authoritative.
  }
}

/**
 * Owns the items + layouts state for a Dashboard instance and persists it
 * under `storageKey`. Screens (MainScreen / StationScreen) call this hook
 * and pass the result into `<Dashboard>` as props, so other consumers
 * (notably the InputDispatcher in Phase 4) can subscribe to item changes
 * without reaching into Dashboard internals.
 */
export interface DashboardState {
  items: DashboardItem[];
  layouts: Layouts;
  currentLayouts: Layouts;
  breakpoint: string;
  handleLayoutChange: (current: Layout[], all: Layouts) => void;
  handleBreakpointChange: (bp: string) => void;
  addItem: (item: DashboardItem, layout: Partial<Layout>) => void;
  updateItemConfig: (id: string, config: Record<string, unknown>) => void;
  updateItemMappings: (id: string, mappings: InputMappings) => void;
  /** Subscribe to item changes — fires after every add / update. */
  subscribeItems: (cb: (items: DashboardItem[]) => void) => () => void;
}

export function useDashboardState(
  storageKey: string | undefined,
  initial: DashboardConfig,
): DashboardState {
  const loadedRef = useRef<PersistedState | null>(
    storageKey ? loadState(storageKey) : null,
  );
  const saved = loadedRef.current;

  const [items, setItemsInner] = useState<DashboardItem[]>(
    saved?.items ?? initial.items,
  );
  const [layouts, setLayouts] = useState<Layouts>(
    saved?.layouts ?? initial.layouts,
  );
  const [currentLayouts, setCurrentLayouts] = useState<Layouts>(
    saved?.layouts ?? initial.layouts,
  );
  const [breakpoint, setBreakpoint] = useState<string>("lg");

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const layoutsRef = useRef(layouts);
  layoutsRef.current = layouts;

  const itemListeners = useRef(new Set<(items: DashboardItem[]) => void>());

  const persist = useCallback(
    (nextItems: DashboardItem[], nextLayouts: Layouts) => {
      if (storageKey) {
        saveState(storageKey, { items: nextItems, layouts: nextLayouts });
      }
    },
    [storageKey],
  );

  const setItems = useCallback(
    (update: (prev: DashboardItem[]) => DashboardItem[]) => {
      setItemsInner((prev) => {
        const next = update(prev);
        persist(next, layoutsRef.current);
        itemListeners.current.forEach((cb) => {
          cb(next);
        });
        return next;
      });
    },
    [persist],
  );

  const handleLayoutChange = useCallback(
    (_current: Layout[], all: Layouts) => {
      setCurrentLayouts(all);
      setLayouts(all);
      persist(itemsRef.current, all);
    },
    [persist],
  );

  const handleBreakpointChange = useCallback((bp: string) => {
    setBreakpoint(bp);
  }, []);

  const addItem = useCallback(
    (item: DashboardItem, layout: Partial<Layout>) => {
      setItemsInner((prev) => {
        const next = [...prev, item];
        persist(next, layoutsRef.current);
        itemListeners.current.forEach((cb) => {
          cb(next);
        });
        return next;
      });
      const entry: Layout = {
        i: item.i,
        x: layout.x ?? 0,
        y: layout.y ?? 9999,
        w: layout.w ?? 3,
        h: layout.h ?? 3,
        ...layout,
      };
      const nextLayouts = Object.fromEntries(
        COLS_KEYS.map((bp) => [bp, [...(currentLayouts[bp] ?? []), entry]]),
      );
      setLayouts(nextLayouts);
      setCurrentLayouts(nextLayouts);
      persist(itemsRef.current, nextLayouts);
    },
    [currentLayouts, persist],
  );

  const updateItemConfig = useCallback(
    (id: string, newConfig: Record<string, unknown>) => {
      setItems((prev) =>
        prev.map((it) => (it.i === id ? { ...it, config: newConfig } : it)),
      );
    },
    [setItems],
  );

  const updateItemMappings = useCallback(
    (id: string, mappings: InputMappings) => {
      setItems((prev) =>
        prev.map((it) =>
          it.i === id ? { ...it, inputMappings: mappings } : it,
        ),
      );
    },
    [setItems],
  );

  const subscribeItems = useCallback((cb: (items: DashboardItem[]) => void) => {
    itemListeners.current.add(cb);
    return () => {
      itemListeners.current.delete(cb);
    };
  }, []);

  return {
    items,
    layouts,
    currentLayouts,
    breakpoint,
    handleLayoutChange,
    handleBreakpointChange,
    addItem,
    updateItemConfig,
    updateItemMappings,
    subscribeItems,
  };
}
