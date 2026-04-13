/**
 * Smoke tests for telemetry visualisation components:
 * CurrentOrbit, DistanceToTarget, OrbitView, MapView.
 *
 * These are integration tests: real data source, real hooks, real components —
 * only the network is intercepted by MSW.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { ws } from 'msw';
import { clearRegistry, registerDataSource, registerStockBodies, clearBodies } from '@gonogo/core';
import {
  CurrentOrbitComponent,
  DistanceToTargetComponent,
  OrbitViewComponent,
  MapViewComponent,
} from '@gonogo/components';
import { telemachusSource } from '../dataSources/telemachus';

const telemachusWs = ws.link('ws://localhost:8085/datalink');
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
  telemachusSource.disconnect();
  clearBodies();
});
afterAll(() => server.close());

beforeEach(() => {
  clearRegistry();
  registerDataSource(telemachusSource);
  registerStockBodies();
});

// ---------------------------------------------------------------------------
// Helper: set up a WS handler that streams a fixed telemetry snapshot once
// subscribed.
// ---------------------------------------------------------------------------
function setupTelemetry(snapshot: Record<string, unknown>) {
  server.use(
    telemachusWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => {
        const msg = JSON.parse(data as string) as { '+'?: string[] };
        if (msg['+']) {
          const update: Record<string, unknown> = {};
          for (const key of msg['+']) {
            if (key in snapshot) update[key] = snapshot[key];
          }
          if (Object.keys(update).length > 0) client.send(JSON.stringify(update));
        }
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// CurrentOrbit
// ---------------------------------------------------------------------------
describe('CurrentOrbitComponent', () => {
  it('renders ORBIT heading', () => {
    render(<CurrentOrbitComponent />);
    expect(screen.getByText('ORBIT')).toBeInTheDocument();
  });

  it('shows dashes before data arrives', () => {
    render(<CurrentOrbitComponent />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('shows apoapsis value when data arrives', async () => {
    setupTelemetry({ 'o.apoapsis': 250_000, 'o.periapsis': 80_000, 'o.eccentricity': 0.1 });
    await telemachusSource.connect();
    render(<CurrentOrbitComponent />);
    // formatDistance(250_000) = '250.0 km'
    await waitFor(() => expect(screen.getByText('250.0 km')).toBeInTheDocument());
  });

  it('shows reference body when provided', async () => {
    setupTelemetry({ 'o.referenceBody': 'Kerbin' });
    await telemachusSource.connect();
    render(<CurrentOrbitComponent />);
    await waitFor(() => expect(screen.getByText('Kerbin')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// DistanceToTarget
// ---------------------------------------------------------------------------
describe('DistanceToTargetComponent', () => {
  it('shows "No target body configured" when no config given', () => {
    render(<DistanceToTargetComponent />);
    expect(screen.getByText('No target body configured')).toBeInTheDocument();
  });

  it('shows "No target set in KSP" when tar.name is undefined', () => {
    render(<DistanceToTargetComponent config={{ targetBody: 'Mun' }} />);
    expect(screen.getByText('No target set in KSP')).toBeInTheDocument();
  });

  it('shows distance when KSP target matches configured body', async () => {
    setupTelemetry({ 'tar.name': 'Mun', 'tar.distance': 12_000_000 });
    await telemachusSource.connect();
    render(<DistanceToTargetComponent config={{ targetBody: 'Mun' }} />);
    // formatDistance(12_000_000) = '12.00 Mm'
    await waitFor(() => expect(screen.getByText('12.00 Mm')).toBeInTheDocument());
  });

  it('shows guidance when a different body is targeted', async () => {
    setupTelemetry({ 'tar.name': 'Duna' });
    await telemachusSource.connect();
    render(<DistanceToTargetComponent config={{ targetBody: 'Mun' }} />);
    await waitFor(() => expect(screen.getByText(/currently targeting Duna/i)).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// OrbitView
// ---------------------------------------------------------------------------
describe('OrbitViewComponent', () => {
  it('renders ORBIT VIEW heading', () => {
    render(<OrbitViewComponent />);
    expect(screen.getByText('ORBIT VIEW')).toBeInTheDocument();
  });

  it('shows "No orbital data" before any values arrive', () => {
    render(<OrbitViewComponent />);
    expect(screen.getByText('No orbital data')).toBeInTheDocument();
  });

  it('renders SVG diagram when orbital data arrives', async () => {
    setupTelemetry({
      'o.sma': 700_000,
      'o.eccentricity': 0.1,
      'o.apoapsis': 770_000,
      'o.periapsis': 630_000,
      'o.trueAnomaly': 0,
      'o.argumentOfPeriapsis': 0,
    });
    await telemachusSource.connect();
    render(<OrbitViewComponent />);
    await waitFor(() => expect(screen.getByRole('img', { name: /orbital diagram/i })).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------
describe('MapViewComponent', () => {
  it('renders MAP VIEW heading', () => {
    render(<MapViewComponent config={{ targetBody: 'Kerbin' }} />);
    expect(screen.getByText('MAP VIEW')).toBeInTheDocument();
  });

  it('shows "No body configured" when no config given', () => {
    render(<MapViewComponent />);
    expect(screen.getByText('No body configured')).toBeInTheDocument();
  });

  it('shows body name in header', () => {
    render(<MapViewComponent config={{ targetBody: 'Kerbin' }} />);
    expect(screen.getByText('Kerbin')).toBeInTheDocument();
  });

  it('shows "No position data" before lat/lon arrive', () => {
    render(<MapViewComponent config={{ targetBody: 'Kerbin' }} />);
    expect(screen.getByText('No position data')).toBeInTheDocument();
  });

  it('hides "No position data" overlay once position arrives', async () => {
    setupTelemetry({ 'v.lat': -0.1, 'v.long': 285.4 });
    await telemachusSource.connect();
    render(<MapViewComponent config={{ targetBody: 'Kerbin' }} />);
    await waitFor(() =>
      expect(screen.queryByText('No position data')).not.toBeInTheDocument(),
    );
  });
});
