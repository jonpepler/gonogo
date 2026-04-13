import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { ws } from 'msw';
import { clearRegistry, registerDataSource } from '@gonogo/core';
import { DataSourceStatusComponent } from '@gonogo/components';
import { KosDataSource } from '../dataSources/kos';

const kosProxyWs = ws.link('ws://localhost:3001/kos');
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

beforeEach(() => {
  clearRegistry();
});

describe('kOS data source status', () => {
  let source: KosDataSource;

  beforeEach(() => {
    source = new KosDataSource({ host: 'localhost', port: 3001 });
    registerDataSource(source);
  });

  afterEach(() => {
    cleanup();
    source.disconnect();
  });

  it('shows disconnected before connect() is called', () => {
    render(<DataSourceStatusComponent />);
    expect(screen.getByText('kOS')).toBeInTheDocument();
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('shows connected when the proxy WebSocket handshake succeeds', async () => {
    server.use(kosProxyWs.addEventListener('connection', () => {}));

    await source.connect();
    render(<DataSourceStatusComponent />);

    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('returns to disconnected after an explicit disconnect', async () => {
    server.use(kosProxyWs.addEventListener('connection', () => {}));

    render(<DataSourceStatusComponent />);
    await act(async () => { await source.connect(); });

    act(() => { source.disconnect(); });
    expect(screen.getByText('disconnected')).toBeInTheDocument();
  });

  it('begins reconnecting when the proxy closes the connection', async () => {
    let serverClient: { close: () => void } | null = null;
    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      serverClient = client;
    }));

    render(<DataSourceStatusComponent />);
    await act(async () => { await source.connect(); });

    // Await onStatusChange inside act() so the async 'close' event's state update
    // stays within the act() scope — same pattern as the reconnect loop tests.
    await act(async () => {
      const reconnecting = new Promise<void>(resolve => {
        const unsub = source.onStatusChange(s => { if (s === 'reconnecting') { unsub(); resolve(); } });
      });
      serverClient!.close();
      await reconnecting;
    });

    expect(screen.getByText('reconnecting')).toBeInTheDocument();
  });

  describe('reconnect loop', () => {
    let fastSource: KosDataSource;

    beforeEach(() => {
      clearRegistry();
      fastSource = new KosDataSource(
        { host: 'localhost', port: 3001 },
        { retryIntervalMs: 50, retryTimeoutMs: 300 },
      );
      registerDataSource(fastSource);
    });

    afterEach(() => {
      cleanup();
      fastSource.disconnect();
    });

    it('reconnects automatically when the proxy comes back', async () => {
      let serverClient: { close: () => void } | null = null;
      server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
        serverClient = client;
      }));

      render(<DataSourceStatusComponent />);
      await act(async () => { await fastSource.connect(); });
      expect(screen.getByText('connected')).toBeInTheDocument();

      await act(async () => {
        const connected = new Promise<void>(resolve => {
          const unsub = fastSource.onStatusChange(s => { if (s === 'connected') { unsub(); resolve(); } });
        });
        serverClient!.close();
        await connected;
      });

      expect(screen.getByText('connected')).toBeInTheDocument();
    });

    it('shows disconnected with a retry button after giving up', async () => {
      server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
        setTimeout(() => client.close(), 0);
      }));

      render(<DataSourceStatusComponent />);
      await act(async () => {
        const disconnected = new Promise<void>(resolve => {
          const unsub = fastSource.onStatusChange(s => { if (s === 'disconnected') { unsub(); resolve(); } });
        });
        fastSource.connect();
        await disconnected;
      });

      expect(screen.getByText('disconnected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /reconnect kos/i })).toBeInTheDocument();
    });

    it('retry button triggers a fresh connection attempt', async () => {
      server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
        setTimeout(() => client.close(), 0);
      }));

      render(<DataSourceStatusComponent />);
      await act(async () => {
        const disconnected = new Promise<void>(resolve => {
          const unsub = fastSource.onStatusChange(s => { if (s === 'disconnected') { unsub(); resolve(); } });
        });
        fastSource.connect();
        await disconnected;
      });

      server.resetHandlers();
      server.use(kosProxyWs.addEventListener('connection', () => {}));

      await act(async () => {
        const connected = new Promise<void>(resolve => {
          const unsub = fastSource.onStatusChange(s => { if (s === 'connected') { unsub(); resolve(); } });
        });
        fireEvent.click(screen.getByRole('button', { name: /reconnect kos/i }));
        await connected;
      });

      expect(screen.getByText('connected')).toBeInTheDocument();
    });
  });
});
