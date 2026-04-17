import { useEffect, useRef } from "react";
import { WORLD_H, WORLD_W } from "./camera";
import { getTrajectoryStyle } from "./trajectoryStyle";
import type { TrajectoryPoint } from "./useTrajectoryBuffer";

export function useWorldCanvas({
  trajectoryRef,
  trajectoryCount,
  adjustedMap,
  hasAtmosphere,
  maxAtmosphere,
  bodyName,
}: {
  trajectoryRef: React.MutableRefObject<TrajectoryPoint[]>;
  trajectoryCount: number;
  adjustedMap: (
    w: number,
    h: number,
    lat: number,
    lon: number,
  ) => { x: number; y: number };
  hasAtmosphere: boolean | undefined;
  maxAtmosphere: number | undefined;
  bodyName: string | undefined;
}) {
  // Offscreen canvas that holds the trajectory in world coordinates.
  // Fixed resolution matches WORLD_W × WORLD_H so latLonToMap maps 1:1.
  const worldCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = document.createElement("canvas");
    c.width = WORLD_W;
    c.height = WORLD_H;
    worldCanvasRef.current = c;
    return () => {
      worldCanvasRef.current = null;
    };
  }, []);

  // Clear trajectory when switching celestial bodies.
  // bodyName is the trigger, not read inside — biome-ignore is intentional.
  // biome-ignore lint/correctness/useExhaustiveDependencies: bodyName is the change trigger, not consumed in the body
  useEffect(() => {
    const canvas = worldCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, WORLD_W, WORLD_H);
  }, [bodyName]);

  // Draw the latest trajectory segment incrementally — no full redraws
  useEffect(() => {
    if (trajectoryCount === 0) return;
    const canvas = worldCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const trajectory = trajectoryRef.current;
    const p1 = trajectory.at(-2);
    const p2 = trajectory.at(-1);
    if (!p1 || !p2) return;

    const { x: x1, y: y1 } = adjustedMap(WORLD_W, WORLD_H, p1.lat, p1.lon);
    const { x: x2, y: y2 } = adjustedMap(WORLD_W, WORLD_H, p2.lat, p2.lon);

    const style = getTrajectoryStyle({
      alt: p2.alt,
      maxAtmosphere: maxAtmosphere ?? 100_000,
      hasAtmosphere: hasAtmosphere ?? false,
      q: p2.q,
      mach: p2.mach,
      speed: p2.speed,
      vSpeed: p2.vSpeed,
    });

    const [r, g, b] = style.color;
    ctx.strokeStyle = `rgba(${r},${g},${b},${style.alpha})`;
    ctx.lineWidth = style.width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }, [
    trajectoryCount,
    trajectoryRef,
    adjustedMap,
    hasAtmosphere,
    maxAtmosphere,
  ]);

  return worldCanvasRef;
}
