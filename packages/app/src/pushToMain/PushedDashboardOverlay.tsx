import {
  DashboardItemContext,
  ErrorBoundary,
  getComponent,
} from "@gonogo/core";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { usePushedWidgets, usePushHost } from "./PushHostContext";
import type { PushedWidget } from "./PushHostService";

const COLS = 12;
const BASE_CELL_WIDTH = 100; // px per grid column at 1.0 scale
const BASE_CELL_HEIGHT = 40; // px per grid row at 1.0 scale
const GAP = 8;

interface Placement {
  widget: PushedWidget;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Greedy shelf-pack: widgets land in insertion order, moving to a new row
 * whenever the current one would overflow the column count. Keeps station-
 * side order roughly visible on main and never needs operator placement.
 */
function packWidgets(widgets: PushedWidget[]): {
  placements: Placement[];
  totalRows: number;
} {
  const placements: Placement[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const w of widgets) {
    // Clamp per-widget width so a single oversized widget still fits.
    const width = Math.min(Math.max(1, w.width), COLS);
    const height = Math.max(1, w.height);
    if (x + width > COLS) {
      y += rowHeight;
      x = 0;
      rowHeight = 0;
    }
    placements.push({ widget: w, x, y, w: width, h: height });
    x += width;
    rowHeight = Math.max(rowHeight, height);
  }
  return { placements, totalRows: y + rowHeight };
}

export function PushedDashboardOverlay() {
  const widgets = usePushedWidgets();
  const host = usePushHost();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({
    w: 0,
    h: 0,
  });

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewport({ w: el.clientWidth, h: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const { placements, totalRows } = useMemo(
    () => packWidgets(widgets),
    [widgets],
  );

  if (widgets.length === 0) return null;

  // Natural (un-scaled) content footprint. The `+ GAP` accounts for the
  // trailing gutter so scaled content doesn't overshoot its viewport.
  const contentW = COLS * BASE_CELL_WIDTH + (COLS - 1) * GAP;
  const contentH =
    totalRows * BASE_CELL_HEIGHT + Math.max(0, totalRows - 1) * GAP;

  const scale =
    viewport.w > 0 && viewport.h > 0
      ? Math.min(1, viewport.w / contentW, viewport.h / contentH)
      : 1;

  return (
    <Backdrop>
      <Panel>
        <Header>
          <Title>PUSHED FROM STATIONS</Title>
          <Count>
            {widgets.length} widget{widgets.length === 1 ? "" : "s"}
          </Count>
        </Header>
        <Viewport ref={viewportRef}>
          <ScaledFrame
            style={{
              transform: `scale(${scale})`,
              width: contentW,
              height: contentH,
            }}
          >
            {placements.map((p) => (
              <PushedItem
                key={`${p.widget.peerId}:${p.widget.widgetInstanceId}`}
                placement={p}
                onDismiss={() =>
                  host?.dismiss(p.widget.peerId, p.widget.widgetInstanceId)
                }
              />
            ))}
          </ScaledFrame>
        </Viewport>
      </Panel>
    </Backdrop>
  );
}

function PushedItem({
  placement,
  onDismiss,
}: Readonly<{ placement: Placement; onDismiss: () => void }>) {
  const def = getComponent(placement.widget.componentId);
  const pxX = placement.x * (BASE_CELL_WIDTH + GAP);
  const pxY = placement.y * (BASE_CELL_HEIGHT + GAP);
  const pxW = placement.w * BASE_CELL_WIDTH + (placement.w - 1) * GAP;
  const pxH = placement.h * BASE_CELL_HEIGHT + (placement.h - 1) * GAP;
  return (
    <ItemFrame
      style={{ left: pxX, top: pxY, width: pxW, height: pxH }}
      aria-label={`Pushed widget ${def?.name ?? placement.widget.componentId} from ${placement.widget.stationName}`}
    >
      <ItemHeader>
        <StationChip>{placement.widget.stationName}</StationChip>
        <DismissBtn
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss pushed widget"
          title="Dismiss"
        >
          ✕
        </DismissBtn>
      </ItemHeader>
      <ItemBody>
        {def ? (
          // DashboardItemContext is required by widgets that consume
          // `useActionInput` (MapView, ActionGroup, …) — the station's
          // copy has it; our mirror on main has to provide it too or the
          // hook throws. Actions won't actually fire here since there's
          // no main-side InputDispatcher bound to this instance id.
          <DashboardItemContext.Provider
            value={{ instanceId: placement.widget.widgetInstanceId }}
          >
            <ErrorBoundary
              fallback={(error) => (
                <MissingComponent>
                  {def.name} crashed: {error.message || String(error)}
                </MissingComponent>
              )}
            >
              <def.component
                id={placement.widget.widgetInstanceId}
                config={placement.widget.config}
                w={placement.w}
                h={placement.h}
              />
            </ErrorBoundary>
          </DashboardItemContext.Provider>
        ) : (
          <MissingComponent>
            Component "{placement.widget.componentId}" not registered on this
            screen.
          </MissingComponent>
        )}
      </ItemBody>
    </ItemFrame>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  pointer-events: none;
`;

const Panel = styled.div`
  pointer-events: auto;
  width: 100%;
  height: 100%;
  max-width: 1600px;
  background: #0a0a0a;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #1a1a1a;
  background: #0f0f0f;
  font-family: monospace;
  flex-shrink: 0;
`;

const Title = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #888;
`;

const Count = styled.div`
  font-size: 11px;
  color: #555;
`;

const Viewport = styled.div`
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
  padding: 12px;
`;

const ScaledFrame = styled.div`
  position: absolute;
  top: 12px;
  left: 12px;
  transform-origin: top left;
`;

const ItemFrame = styled.div`
  position: absolute;
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ItemHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: #141414;
  border-bottom: 1px solid #1f1f1f;
  flex-shrink: 0;
`;

const StationChip = styled.span`
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6af;
`;

const DismissBtn = styled.button`
  background: none;
  border: none;
  color: #555;
  font-size: 12px;
  line-height: 1;
  padding: 2px 4px;
  cursor: pointer;
  &:hover {
    color: #f88;
  }
`;

const ItemBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const MissingComponent = styled.div`
  padding: 12px;
  font-family: monospace;
  font-size: 11px;
  color: #a66;
  text-align: center;
`;
