import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onRelease?: () => void;
}

/**
 * 1-D horizontal slider that emits normalised -1..1 values on drag and
 * returns to centre on release (so analog inputs auto-zero when unheld).
 */
export function AnalogPad({
  label,
  value,
  onChange,
  onRelease,
}: Readonly<Props>) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const raw = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, raw));
      onChange(clamped * 2 - 1);
    },
    [onChange],
  );

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: PointerEvent) => {
      updateFromPointer(e.clientX);
    };
    const handleUp = () => {
      setDragging(false);
      onRelease?.();
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragging, updateFromPointer, onRelease]);

  const thumbLeft = `${((value + 1) / 2) * 100}%`;

  return (
    <Wrap>
      <Label>{label}</Label>
      <Track
        ref={trackRef}
        onPointerDown={(e) => {
          setDragging(true);
          updateFromPointer(e.clientX);
        }}
      >
        <Centre />
        <Thumb style={{ left: thumbLeft }} $active={dragging} />
      </Track>
      <Value>{value.toFixed(2)}</Value>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.span`
  font-family: monospace;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #666;
`;

const Track = styled.div`
  position: relative;
  height: 24px;
  background: #0d0d0d;
  border: 1px solid #222;
  border-radius: 4px;
  cursor: pointer;
  touch-action: none;
`;

const Centre = styled.div`
  position: absolute;
  left: 50%;
  top: 4px;
  bottom: 4px;
  width: 1px;
  background: #222;
`;

const Thumb = styled.div<{ $active: boolean }>`
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${({ $active }) => ($active ? "#00ff88" : "#7cf")};
  box-shadow: 0 0 6px
    ${({ $active }) =>
      $active ? "rgba(0,255,136,0.5)" : "rgba(124,204,255,0.4)"};
  pointer-events: none;
`;

const Value = styled.span`
  font-family: monospace;
  font-size: 10px;
  color: #555;
  text-align: right;
`;
