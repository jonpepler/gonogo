import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { ws } from 'msw';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import { DataSourceStatusComponent } from '@gonogo/components';
import { TelemachusDataSource, telemachusSource } from '../dataSources/telemachus';

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

  it('begins reconnecting when the server closes the connection', async () => {
    // setStatus('reconnecting') fires synchronously in onClose(), so waitFor catches it
    // quickly. The 5 s retry timer is cleaned up by afterEach disconnect.
    let serverClient: { close: (code?: number) => void } | null = null;
    server.use(telemachusWs.addEventListener('connection', ({ client }) => {
      serverClient = client;
    }));

    render(<DataSourceStatusComponent />);
    await act(async () => { await telemachusSource.connect(); });
    await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());

    act(() => { serverClient!.close(); });
    await waitFor(() => expect(screen.getByText('reconnecting')).toBeInTheDocument());
  });

  // -------------------------------------------------------------------------
  // Reconnect loop — use a source with short retry params so tests run fast.
  // -------------------------------------------------------------------------
  describe('reconnect loop', () => {
    let source: TelemachusDataSource;

    beforeEach(() => {
      clearRegistry();
      source = new TelemachusDataSource(
        { host: 'localhost', port: 8085 },
        { retryIntervalMs: 50, retryTimeoutMs: 300 },
      );
      registerDataSource(source);
    });

    afterEach(() => {
      source.disconnect();
    });

    it('reconnects automatically when the server comes back', async () => {
      let connectionCount = 0;
      let serverClient: { close: () => void } | null = null;
      server.use(
        telemachusWs.addEventListener('connection', ({ client }) => {
          connectionCount++;
          serverClient = client;
          // All connections stay open; test closes the first one explicitly inside act()
        }),
      );

      render(<DataSourceStatusComponent />);
      await act(async () => { await source.connect(); });
      await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());

      // Close inside act() so the resulting state update ('reconnecting') is captured
      act(() => { serverClient!.close(); });
      await waitFor(() => expect(screen.getByText('reconnecting')).toBeInTheDocument());
      // After 50 ms retry the server keeps the second connection open → connected
      await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());
    });

    it('shows disconnected with a retry button after giving up', async () => {
      server.use(
        telemachusWs.addEventListener('connection', ({ client }) => {
          // Defer close so the client's 'open' event fires first
          setTimeout(() => client.close(), 0);
        }),
      );

      render(<DataSourceStatusComponent />);
      await act(async () => { await source.connect(); });
      await waitFor(() => expect(screen.getByText('reconnecting')).toBeInTheDocument());

      await waitFor(
        () => expect(screen.getByText('disconnected')).toBeInTheDocument(),
        { timeout: 2000 },
      );
      expect(screen.getByRole('button', { name: /reconnect telemachus reborn/i })).toBeInTheDocument();
    });

    it('reconnect button triggers a fresh connection attempt', async () => {
      server.use(
        telemachusWs.addEventListener('connection', ({ client }) => {
          // Defer close so the client's 'open' event fires first
          setTimeout(() => client.close(), 0);
        }),
      );

      render(<DataSourceStatusComponent />);
      await act(async () => { await source.connect(); });
      await waitFor(
        () => expect(screen.getByText('disconnected')).toBeInTheDocument(),
        { timeout: 2000 },
      );

      // Now let the next connection succeed
      server.resetHandlers();
      server.use(telemachusWs.addEventListener('connection', () => {}));

      // Click triggers connect() whose 'open' callback fires asynchronously;
      // waitFor wraps each poll in act(), so the state update is safely captured.
      fireEvent.click(screen.getByRole('button', { name: /reconnect telemachus reborn/i }));
      await waitFor(() => expect(screen.getByText('connected')).toBeInTheDocument());
    });
  });
});
