import styled from 'styled-components';
import { useEffect, useRef, useState } from 'react';
import { registerComponent, useDataValue, getBody } from '@gonogo/core';
import { latLonToMap } from '@gonogo/core';
import type { ComponentProps, ConfigComponentProps } from '@gonogo/core';

interface MapViewConfig {
  /** Number of trajectory history points to keep. Default: 200. */
  trajectoryLength?: number;
  /** Telemachus keys selected for display in the telemetry panel. */
  telemetryKeys?: string[];
}

/** Predefined data points available in the telemetry panel. */
const TELEMETRY_OPTIONS: { label: string; key: string }[] = [
  { label: 'Altitude (sea level)', key: 'v.altitude' },
  { label: 'Altitude (terrain)',   key: 'v.heightFromTerrain' },
  { label: 'Vertical speed',       key: 'v.verticalSpeed' },
  { label: 'Surface speed',        key: 'v.surfaceSpeed' },
  { label: 'Orbital speed',        key: 'v.orbitalSpeed' },
  { label: 'Mach',                 key: 'v.mach' },
  { label: 'G-force',              key: 'v.geeForce' },
  { label: 'Heading',              key: 'v.heading' },
  { label: 'Pitch',                key: 'v.pitch' },
  { label: 'Roll',                 key: 'v.roll' },
  { label: 'Mission time',         key: 'v.missionTime' },
  { label: 'Apoapsis',             key: 'o.apoapsis' },
  { label: 'Periapsis',            key: 'o.periapsis' },
  { label: 'Time to Ap',           key: 'o.timeToAp' },
  { label: 'Time to Pe',           key: 'o.timeToPe' },
  { label: 'Inclination',          key: 'o.inclination' },
];

function MapViewComponent({ config, h }: ComponentProps<MapViewConfig>) {
  const trajectoryLength = config?.trajectoryLength ?? 200;
  const telemetryKeys = config?.telemetryKeys ?? [];
  const showTelemetry = telemetryKeys.length > 0;

  const lat      = useDataValue<number>('telemachus', 'v.lat');
  const lon      = useDataValue<number>('telemachus', 'v.long');
  const bodyName = useDataValue<string>('telemachus', 'v.body');

  const targetBodyId = bodyName;

  const baseRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dataRef    = useRef<HTMLCanvasElement>(null);
  // Observes MapOuter (the full available area) so we can letterbox correctly
  const outerRef = useRef<HTMLDivElement>(null);

  // Letterboxed canvas pixel dimensions — cW = min(outerW, outerH * 2), cH = cW / 2
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  // Trajectory history buffer: [{lat, lon}, ...]
  const trajectoryRef = useRef<Array<{ lat: number; lon: number }>>([]);

  // Track previous lat/lon to avoid duplicate pushes
  const prevPosRef = useRef<{ lat: number; lon: number } | null>(null);

  // ── ResizeObserver — watches MapOuter, computes letterboxed canvas size ────
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // 2:1 contain: fill width unless that would exceed the available height
      const cW = Math.floor(Math.min(width, height * 2));
      const cH = Math.floor(cW / 2);
      setContainerSize({ w: cW, h: cH });
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

    function drawBase(textureImage?: HTMLImageElement) {
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, w, h);

      if (textureImage) {
        // Equirectangular texture fills the canvas exactly
        ctx.drawImage(textureImage, 0, 0, w, h);
        // Darken slightly so grid lines read against bright textures
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, w, h);
      } else if (body?.color) {
        // Fallback: subtle colour tint
        ctx.fillStyle = body.color + '22';
        ctx.fillRect(0, 0, w, h);
      }

      // Grid lines
      ctx.strokeStyle = textureImage ? 'rgba(255,255,255,0.08)' : '#1a1a1a';
      ctx.lineWidth = 1;

      for (let lat30 = -60; lat30 <= 60; lat30 += 30) {
        const { y } = latLonToMap(lat30, 0, w, h);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      for (let lon30 = -150; lon30 <= 180; lon30 += 30) {
        const { x } = latLonToMap(0, lon30, w, h);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }

      // Equator & prime meridian slightly brighter
      ctx.strokeStyle = textureImage ? 'rgba(255,255,255,0.18)' : '#2a2a2a';
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
    }

    if (body?.texture) {
      const img = new Image();
      img.onload = () => drawBase(img);
      img.onerror = () => drawBase(); // fall back to colour on load failure
      img.src = body.texture;
    } else {
      drawBase();
    }
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

    // Apply per-body coordinate offsets to align plotted positions with the
    // texture's prime meridian. Longitude wraps at ±180; latitude clamps.
    const body = targetBodyId ? getBody(targetBodyId) : undefined;
    const lonOff = body?.longitudeOffset ?? 0;
    const latOff = body?.latitudeOffset ?? 0;

    function adjustedMap(rawLat: number, rawLon: number) {
      const adjLon = ((rawLon + lonOff + 180) % 360 + 360) % 360 - 180;
      const adjLat = Math.max(-90, Math.min(90, rawLat + latOff));
      return latLonToMap(adjLat, adjLon, w, h);
    }

    const trajectory = trajectoryRef.current;

    // Trajectory trail
    if (trajectory.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0,255,136,0.3)';
      ctx.lineWidth = 1.5;

      const first = trajectory[0];
      const { x: fx, y: fy } = adjustedMap(first.lat, first.lon);
      ctx.moveTo(fx, fy);

      for (let i = 1; i < trajectory.length; i++) {
        const pt = trajectory[i];
        const { x, y } = adjustedMap(pt.lat, pt.lon);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Vessel dot
    if (lat !== undefined && lon !== undefined) {
      const { x, y } = adjustedMap(lat, lon);
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
  const displayName = body?.name ?? targetBodyId;

  return (
    <Panel>
      <Header>
        <Title>MAP VIEW</Title>
        {displayName && <BodyLabel>{displayName}</BodyLabel>}
      </Header>

      {/* Letterbox wrapper: observes available space, sizes canvas to fit 2:1 */}
      <MapOuter ref={outerRef}>
        <CanvasContainer
          style={containerSize
            ? { width: containerSize.w, height: containerSize.h }
            : undefined}
        >
          <BaseCanvas ref={baseRef} />
          <OverlayCanvas ref={overlayRef} />
          <DataCanvas ref={dataRef} />
          {(lat === undefined || lon === undefined) && (
            <NoSignal>
              {targetBodyId === undefined ? 'Waiting for telemetry…' : 'No position data'}
            </NoSignal>
          )}
        </CanvasContainer>
      </MapOuter>

      {showTelemetry && (
        <TelemetryPanel>
          {telemetryKeys.map((key, idx) => {
            const opt = TELEMETRY_OPTIONS.find((o) => o.key === key);
            return <TelemetryRow key={key} dataKey={key} label={opt?.label ?? key} colorIndex={idx} />;
          })}
        </TelemetryPanel>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Telemetry row — own component so useDataValue can be called per key
// ---------------------------------------------------------------------------

const TELEMETRY_COLOURS = [
  '#00cc66', // green
  '#4499ff', // blue
  '#ff8c00', // orange
  '#cc44cc', // purple
  '#ff4466', // red-pink
  '#00cccc', // cyan
  '#cccc00', // yellow
  '#ff6633', // orange-red
];

function formatTelValue(value: unknown): string {
  if (value === undefined) return '—';
  const n = Number(value);
  if (!isNaN(n) && typeof value !== 'boolean') return n.toFixed(2);
  return String(value);
}

function TelemetryRow({ dataKey, label, colorIndex }: { dataKey: string; label: string; colorIndex: number }) {
  const value = useDataValue<unknown>('telemachus', dataKey);
  const colour = TELEMETRY_COLOURS[colorIndex % TELEMETRY_COLOURS.length];
  return (
    <TelRow>
      <TelKey $colour={colour}>{label}</TelKey>
      <TelValue $colour={colour}>{formatTelValue(value)}</TelValue>
    </TelRow>
  );
}

// ---------------------------------------------------------------------------
// Config component (rendered inside modal)
// ---------------------------------------------------------------------------

function MapViewConfigComponent({ config, onSave }: ConfigComponentProps<MapViewConfig>) {
  const [trajectoryLength, setTrajectoryLength] = useState(
    String(config?.trajectoryLength ?? 200),
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(config?.telemetryKeys ?? []),
  );

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    // Preserve the order from TELEMETRY_OPTIONS rather than Set insertion order
    const keys = TELEMETRY_OPTIONS.map((o) => o.key).filter((k) => selected.has(k));
    onSave({
      trajectoryLength: Math.max(1, parseInt(trajectoryLength, 10) || 200),
      telemetryKeys: keys.length > 0 ? keys : undefined,
    });
  };

  return (
    <ConfigForm>
      <Field>
        <CfgLabel htmlFor="map-traj">Trajectory history (points)</CfgLabel>
        <CfgInput
          id="map-traj"
          type="number"
          min={1}
          max={2000}
          value={trajectoryLength}
          onChange={(e) => setTrajectoryLength(e.target.value)}
        />
      </Field>
      <Field>
        <CfgLabel>Telemetry panel</CfgLabel>
        <CheckList>
          {TELEMETRY_OPTIONS.map(({ label, key }) => (
            <CheckRow key={key}>
              <Checkbox
                id={`map-key-${key}`}
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => toggleKey(key)}
              />
              <CheckLabel htmlFor={`map-key-${key}`}>{label}</CheckLabel>
            </CheckRow>
          ))}
        </CheckList>
        <CfgHint>Selected values are shown below the map.</CfgHint>
      </Field>
      <CfgSaveButton onClick={handleSave}>Save</CfgSaveButton>
    </ConfigForm>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<MapViewConfig>({
  id: 'map-view',
  name: 'Map View',
  description: 'Equirectangular map of the current body with vessel position and trajectory trail.',
  tags: ['telemetry'],
  defaultSize: { w: 4, h: 6 },
  component: MapViewComponent,
  configComponent: MapViewConfigComponent,
  dataRequirements: ['v.lat', 'v.long', 'v.body'],
  behaviors: [],
  defaultConfig: { trajectoryLength: 200 },
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
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
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

/**
 * Fills leftover space. The ResizeObserver measures this element's actual
 * content rect and computes letterboxed pixel dimensions for CanvasContainer.
 */
const MapOuter = styled.div`
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
const CanvasContainer = styled.div`
  position: relative;
  flex-shrink: 0;
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

const TelemetryPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding-top: 4px;
  border-top: 1px solid #1a1a1a;
  flex-shrink: 0;
`;

const TelRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
`;

const TelKey = styled.span<{ $colour: string }>`
  font-size: 9px;
  color: ${({ $colour }) => $colour};
  opacity: 0.6;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const TelValue = styled.span<{ $colour: string }>`
  font-size: 12px;
  font-weight: 600;
  color: ${({ $colour }) => $colour};
  font-variant-numeric: tabular-nums;
  min-width: 7ch;
  white-space: nowrap;
`;

// ---------------------------------------------------------------------------
// Config form styles
// ---------------------------------------------------------------------------

const ConfigForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: monospace;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const CfgLabel = styled.label`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
`;

const CfgInput = styled.input`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;
  &:focus { border-color: #555; }
`;

const CheckList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const CheckRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Checkbox = styled.input`
  accent-color: #00cc66;
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
`;

const CheckLabel = styled.label`
  font-family: monospace;
  font-size: 12px;
  color: #bbb;
  cursor: pointer;
  user-select: none;
`;

const CfgHint = styled.span`
  font-size: 10px;
  color: #444;
`;

const CfgSaveButton = styled.button`
  align-self: flex-end;
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  border-radius: 3px;
  color: #00cc66;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 6px 16px;
  cursor: pointer;
  text-transform: uppercase;
  &:hover { background: #1f4a1f; border-color: #3a7a3a; }
`;
