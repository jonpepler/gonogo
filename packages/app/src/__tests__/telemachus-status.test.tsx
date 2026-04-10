import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { ws } from 'msw';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import { DataSourceStatusComponent } from '@gonogo/components';
import { telemachusSource } from '../dataSources/telemachus';

const telemachusWs = ws.link('ws://localhost:8085/datalink');
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  cleanup(); // unmount before disconnect to avoid out-of-act state updates
  server.resetHandlers();
  telemachusSource.disconnect();
});
afterAll(() => server.close());

beforeEach(() => {
  clearRegistry();
  registerDataSource(telemachusSource);
});

describe('Telemachus Reborn data source status', () => {
  it('shows disconnected before connect() is called', () => {
    render(<DataSourceStatusComponent />);

    expect(screen.getByText('Telemachus Reborn')).toBeInTheDocument();
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('shows connected when the WebSocket handshake succeeds', async () => {
    server.use(telemachusWs.addEventListener('connection', () => {}));

    // Connect before rendering so the component mounts with status already 'connected',
    // avoiding an out-of-act state transition when the WebSocket 'open' event fires.
    await telemachusSource.connect();
    render(<DataSourceStatusComponent />);

    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('returns to disconnected after an explicit disconnect', async () => {
    server.use(telemachusWs.addEventListener('connection', () => {}));

    render(<DataSourceStatusComponent />);
    await act(async () => { await telemachusSource.connect(); });
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());

    act(() => { telemachusSource.disconnect(); });
    await waitFor(() => expect(screen.getByText('disconnected')).toBeInTheDocument());
  });

  it('returns to disconnected when the server closes the connection', async () => {
    // Simulates KSP closing mid-session
    let serverClient: { close: (code?: number) => void } | null = null;
    server.use(telemachusWs.addEventListener('connection', ({ client }) => {
      serverClient = client;
    }));

    render(<DataSourceStatusComponent />);
    await act(async () => { await telemachusSource.connect(); });
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());

    act(() => { serverClient!.close(); });
    await waitFor(() => expect(screen.getByText('disconnected')).toBeInTheDocument());
  });
});
