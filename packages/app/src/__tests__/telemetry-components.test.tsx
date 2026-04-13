/**
 * Smoke tests for telemetry visualisation components:
 * CurrentOrbit, DistanceToTarget, OrbitView, MapView.
 *
 * These are integration tests: real data source, real hooks, real components —
 * only the network is intercepted by MSW.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
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
  afterEach(() => localStorage.clear());

  it('shows prompt to configure when no body is stored', () => {
    render(<DistanceToTargetComponent />);
    expect(screen.getByText(/use ⚙ to configure/i)).toBeInTheDocument();
  });

  it('shows "No target set in KSP" when body is set but no tar.name', () => {
    localStorage.setItem('gonogo:distance-to-target:body', 'Mun');
    render(<DistanceToTargetComponent />);
    expect(screen.getByText('No target set in KSP')).toBeInTheDocument();
  });

  it('shows distance when KSP target matches stored body', async () => {
    localStorage.setItem('gonogo:distance-to-target:body', 'Mun');
    setupTelemetry({ 'tar.name': 'Mun', 'tar.distance': 12_000_000 });
    await telemachusSource.connect();
    render(<DistanceToTargetComponent />);
    // formatDistance(12_000_000) = '12.00 Mm'
    await waitFor(() => expect(screen.getByText('12.00 Mm')).toBeInTheDocument());
  });

  it('shows guidance when a different body is targeted', async () => {
    localStorage.setItem('gonogo:distance-to-target:body', 'Mun');
    setupTelemetry({ 'tar.name': 'Duna' });
    await telemachusSource.connect();
    render(<DistanceToTargetComponent />);
    await waitFor(() => expect(screen.getByText(/currently targeting Duna/i)).toBeInTheDocument());
  });

  it('opens config panel and lists bodies on gear button click', () => {
    render(<DistanceToTargetComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure target body/i }));
    expect(screen.getByText('Select target body')).toBeInTheDocument();
    // Stock bodies are registered in beforeEach — at least Kerbin should appear
    expect(screen.getByText('Kerbin')).toBeInTheDocument();
  });

  it('selecting a body from the config closes the panel and saves to localStorage', () => {
    render(<DistanceToTargetComponent />);
    fireEvent.click(screen.getByRole('button', { name: /configure target body/i }));
    fireEvent.click(screen.getByText('Mun'));
    expect(screen.queryByText('Select target body')).not.toBeInTheDocument();
    expect(localStorage.getItem('gonogo:distance-to-target:body')).toBe('Mun');
    expect(screen.getByText('Mun')).toBeInTheDocument();
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
    render(<MapViewComponent />);
    expect(screen.getByText('MAP VIEW')).toBeInTheDocument();
  });

  it('shows "Waiting for telemetry" before v.body arrives', () => {
    render(<MapViewComponent />);
    expect(screen.getByText('Waiting for telemetry…')).toBeInTheDocument();
  });

  it('shows body name in header once v.body arrives', async () => {
    setupTelemetry({ 'v.body': 'Kerbin' });
    await telemachusSource.connect();
    render(<MapViewComponent />);
    await waitFor(() => expect(screen.getByText('Kerbin')).toBeInTheDocument());
  });

  it('shows "No position data" when body is known but lat/lon not yet received', async () => {
    setupTelemetry({ 'v.body': 'Kerbin' });
    await telemachusSource.connect();
    render(<MapViewComponent />);
    await waitFor(() => expect(screen.getByText('Kerbin')).toBeInTheDocument());
    expect(screen.getByText('No position data')).toBeInTheDocument();
  });

  it('hides "No position data" overlay once position arrives', async () => {
    setupTelemetry({ 'v.body': 'Kerbin', 'v.lat': -0.1, 'v.long': 285.4 });
    await telemachusSource.connect();
    render(<MapViewComponent />);
    await waitFor(() =>
      expect(screen.queryByText('No position data')).not.toBeInTheDocument(),
    );
  });
});
