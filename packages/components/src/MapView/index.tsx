import styled from 'styled-components';
import { useEffect, useRef, useState } from 'react';
import { registerComponent, useDataValue, getBody } from '@gonogo/core';
import { latLonToMap } from '@gonogo/core';
import type { ComponentProps } from '@gonogo/core';

interface MapViewConfig {
  /** Body to show the map for. Must match a registered body ID. */
  targetBody: string;
  /** Number of trajectory history points to keep. Default: 200. */
  trajectoryLength?: number;
}

function MapViewComponent({ config }: ComponentProps<MapViewConfig>) {
  const targetBodyId = config?.targetBody;
  const trajectoryLength = config?.trajectoryLength ?? 200;

  const lat  = useDataValue<number>('telemachus', 'v.lat');
  const lon  = useDataValue<number>('telemachus', 'v.long');

  const baseRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dataRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  // Trajectory history buffer: [{lat, lon}, ...]
  const trajectoryRef = useRef<Array<{ lat: number; lon: number }>>([]);

  // Track previous lat/lon to avoid duplicate pushes
  const prevPosRef = useRef<{ lat: number; lon: number } | null>(null);

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setContainerSize({ w: Math.floor(width), h: Math.floor(height) });
    });

    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ── Accumulate trajectory ─────────────────────────────────────────────────
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const prev = prevPosRef.current;
    if (prev && prev.lat === lat && prev.lon === lon) return;

    prevPosRef.current = { lat, lon };
    trajectoryRef.current = [
      ...trajectoryRef.current.slice(-(trajectoryLength - 1)),
      { lat, lon },
    ];
  }, [lat, lon, trajectoryLength]);

  // ── Draw base layer ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = baseRef.current;
    if (!canvas || !containerSize) return;
    const { w, h } = containerSize;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const body = targetBodyId ? getBody(targetBodyId) : undefined;

    // Background
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, w, h);

    // Body surface colour as a tinted background
    if (body?.color) {
      ctx.fillStyle = body.color + '22'; // very subtle tint
      ctx.fillRect(0, 0, w, h);
    }

    // Grid lines
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;

    // Latitude lines every 30°
    for (let lat30 = -60; lat30 <= 60; lat30 += 30) {
      const { y } = latLonToMap(lat30, 0, w, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Longitude lines every 30°
    for (let lon30 = -150; lon30 <= 180; lon30 += 30) {
      const { x } = latLonToMap(0, lon30, w, h);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Equator & prime meridian slightly brighter
    ctx.strokeStyle = '#2a2a2a';
    const { y: eqY } = latLonToMap(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, eqY);
    ctx.lineTo(w, eqY);
    ctx.stroke();

    const { x: pmX } = latLonToMap(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(pmX, 0);
    ctx.lineTo(pmX, h);
    ctx.stroke();
  }, [containerSize, targetBodyId]);

  // ── Overlay layer (fog-of-war extension point) ─────────────────────────────
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !containerSize) return;
    canvas.width = containerSize.w;
    canvas.height = containerSize.h;
    // Intentionally blank — fog-of-war or other overlays can be drawn here
  }, [containerSize]);

  // ── Draw data layer (vessel + trajectory) ─────────────────────────────────
  useEffect(() => {
    const canvas = dataRef.current;
    if (!canvas || !containerSize) return;
    const { w, h } = containerSize;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);

    const trajectory = trajectoryRef.current;

    // Trajectory trail
    if (trajectory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,255,136,0.3)';
      ctx.lineWidth = 1.5;

      const first = trajectory[0];
      const { x: fx, y: fy } = latLonToMap(first.lat, first.lon, w, h);
      ctx.moveTo(fx, fy);

      for (let i = 1; i < trajectory.length; i++) {
        const pt = trajectory[i];
        const { x, y } = latLonToMap(pt.lat, pt.lon, w, h);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Vessel dot
    if (lat !== undefined && lon !== undefined) {
      const { x, y } = latLonToMap(lat, lon, w, h);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();

      // Crosshair
      ctx.strokeStyle = 'rgba(0,255,136,0.6)';
      ctx.lineWidth = 1;
      const cross = 8;
      ctx.beginPath();
      ctx.moveTo(x - cross, y);
      ctx.lineTo(x + cross, y);
      ctx.moveTo(x, y - cross);
      ctx.lineTo(x, y + cross);
      ctx.stroke();
    }
  }, [containerSize, lat, lon]);

  const body = targetBodyId ? getBody(targetBodyId) : undefined;
  const displayName = body?.name ?? targetBodyId ?? '—';

  return (
    <Panel>
      <Header>
        <Title>MAP VIEW</Title>
        {targetBodyId && <BodyLabel>{displayName}</BodyLabel>}
      </Header>

      {!targetBodyId ? (
        <NoBody>No body configured</NoBody>
      ) : (
        <CanvasContainer ref={containerRef}>
          <BaseCanvas ref={baseRef} />
          <OverlayCanvas ref={overlayRef} />
          <DataCanvas ref={dataRef} />
          {lat === undefined && lon === undefined && (
            <NoSignal>No position data</NoSignal>
          )}
        </CanvasContainer>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<MapViewConfig>({
  id: 'map-view',
  name: 'Map View',
  category: 'telemetry',
  component: MapViewComponent,
  dataRequirements: ['v.lat', 'v.long'],
  behaviors: [],
  defaultConfig: { targetBody: 'Kerbin', trajectoryLength: 200 },
});

export { MapViewComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 240px;
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  gap: 8px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #555;
  text-transform: uppercase;
`;

const BodyLabel = styled.span`
  font-size: 11px;
  color: #888;
  letter-spacing: 0.05em;
`;

const CanvasContainer = styled.div`
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 2px;
  overflow: hidden;
`;

const CanvasBase = styled.canvas`
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
`;

const BaseCanvas = CanvasBase;
const OverlayCanvas = CanvasBase;
const DataCanvas = CanvasBase;

const NoSignal = styled.div`
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

const NoBody = styled.div`
  font-size: 11px;
  color: #444;
  padding: 8px 0;
`;
