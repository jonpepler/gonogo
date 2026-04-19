import styled from "styled-components";

export const Header = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

export const BodyLabel = styled.span`
  font-size: 11px;
  color: #888;
  letter-spacing: 0.05em;
`;

/**
 * Fills leftover space. The ResizeObserver measures this element's actual
 * content rect and computes letterboxed pixel dimensions for CanvasContainer.
 */
export const MapOuter = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
`;

/**
 * Sized explicitly via inline style (width/height in px) so the canvas is
 * always exactly 2:1 regardless of which dimension is the bottleneck.
 */
export const CanvasContainer = styled.div`
  position: relative;
  flex-shrink: 0;
  border-radius: 2px;
  overflow: hidden;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
`;

const CanvasBase = styled.canvas`
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
`;

export const BaseCanvas = CanvasBase;
export const OverlayCanvas = CanvasBase;
export const DataCanvas = CanvasBase;
export const PersistentDataCanvas = CanvasBase;

export const NoSignal = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #444;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  pointer-events: none;
`;

export const TelemetryPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding-top: 4px;
  border-top: 1px solid #1a1a1a;
  flex-shrink: 0;
`;

export const TelRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

export const TelKey = styled.span<{ $colour: string }>`
  font-size: 9px;
  color: ${({ $colour }) => $colour};
  opacity: 0.6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const TelValue = styled.span<{ $colour: string }>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ $colour }) => $colour};
  font-variant-numeric: tabular-nums;
  min-width: 7ch;
  white-space: nowrap;
`;

export const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const CheckRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const Checkbox = styled.input`
  accent-color: #00cc66;
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
`;

export const CheckLabel = styled.label`
  font-family: monospace;
  font-size: 12px;
  color: #bbb;
  cursor: pointer;
  user-select: none;
`;
