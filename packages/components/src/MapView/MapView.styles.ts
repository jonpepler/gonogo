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
  touch-action: none;

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
export const PredictionCanvas = CanvasBase;

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

export const PredictionChip = styled.div`
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  background: rgba(80, 40, 120, 0.8);
  color: #e0c8ff;
  border: 1px solid #6a3a9a;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: monospace;
  pointer-events: none;
  border-radius: 2px;
`;

export const ImagingChip = styled.span<{ $variant: "on" | "off" | "warn" }>`
  padding: 2px 6px;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: monospace;
  border-radius: 2px;
  border: 1px solid
    ${({ $variant }) =>
      $variant === "on"
        ? "#2a6a3a"
        : $variant === "warn"
          ? "#6a5a2a"
          : "#3a3a3a"};
  background: ${({ $variant }) =>
    $variant === "on"
      ? "rgba(40, 120, 60, 0.3)"
      : $variant === "warn"
        ? "rgba(120, 100, 40, 0.3)"
        : "rgba(40, 40, 40, 0.3)"};
  color: ${({ $variant }) =>
    $variant === "on" ? "#9ee4a9" : $variant === "warn" ? "#e4d99e" : "#888"};
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
