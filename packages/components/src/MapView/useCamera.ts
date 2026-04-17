import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Camera,
  fitCamera,
  type ViewMode,
  WORLD_H,
  WORLD_W,
  zoomBounds,
} from "./camera";

export function useCamera(containerSize: { w: number; h: number } | null) {
  const baseZoom = containerSize
    ? Math.min(containerSize.w / WORLD_W, containerSize.h / WORLD_H)
    : 0.0001;

  const [camera, setCamera] = useState<Camera>(() =>
    fitCamera(containerSize?.w ?? WORLD_W, containerSize?.h ?? WORLD_H),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("global");

  // Ref for the element that receives mouse/wheel events (CanvasContainer)
  const interactionRef = useRef<HTMLDivElement>(null);
  const isPanningRef = useRef(false);
  const lastPanPos = useRef<{ x: number; y: number } | null>(null);

  // Reset to global fit when screen resizes — deliberately scoped to w/h
  // so a new containerSize object with identical dimensions is a no-op.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — react only to dimension changes, not object identity
  useEffect(() => {
    if (containerSize) setCamera(fitCamera(containerSize.w, containerSize.h));
  }, [containerSize?.w, containerSize?.h]);

  // Wheel zoom — addEventListener required so we can call preventDefault
  // (React's onWheel is passive in some setups and cannot prevent page scroll)
  useEffect(() => {
    const el = interactionRef.current;
    if (!el || !containerSize) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const { w, h } = containerSize;

      setViewMode("global"); // any manual interaction exits follow mode
      setCamera((prev) => {
        const { min, max } = zoomBounds(baseZoom);
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const newZoom = Math.max(min, Math.min(max, prev.zoom * factor));
        // Keep the world point under the cursor fixed during zoom
        const wx = (mx - w / 2) / prev.zoom + prev.panX;
        const wy = (my - h / 2) / prev.zoom + prev.panY;
        return {
          zoom: newZoom,
          panX: wx - (mx - w / 2) / newZoom,
          panY: wy - (my - h / 2) / newZoom,
        };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerSize, baseZoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isPanningRef.current = true;
    lastPanPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current || !lastPanPos.current) return;
    const dx = e.clientX - lastPanPos.current.x;
    const dy = e.clientY - lastPanPos.current.y;
    lastPanPos.current = { x: e.clientX, y: e.clientY };
    setViewMode("global"); // any manual interaction exits follow mode
    setCamera((prev) => ({
      ...prev,
      panX: prev.panX - dx / prev.zoom,
      panY: prev.panY - dy / prev.zoom,
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    isPanningRef.current = false;
    lastPanPos.current = null;
  }, []);

  return {
    camera,
    setCamera,
    baseZoom,
    viewMode,
    setViewMode,
    interactionRef,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
