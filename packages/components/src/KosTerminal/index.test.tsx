import { describe, it, expect, vi, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { ws } from 'msw';
import { KosTerminalComponent } from './index';

// xterm.js requires a canvas-capable DOM which jsdom doesn't provide.
// We mock the external library at the boundary: the real WS and component
// logic remain untouched — only the terminal renderer is stubbed.

// vi.hoisted() runs before vi.mock() hoisting so these refs are available
// inside the mock factories.
const termSpies = vi.hoisted(() => ({
  loadAddon: vi.fn(),
  open: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  onData: vi.fn(),
  onResize: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: object) { Object.assign(this, termSpies); }),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: { fit: ReturnType<typeof vi.fn> }) { this.fit = vi.fn(); }),
}));

// CSS import — no-op in test
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

// ResizeObserver is not implemented in jsdom
class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

const kosProxyWs = ws.link('ws://localhost:3001/kos');
const server = setupServer();

beforeAll(() => server.listen());
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const DEFAULT_CONFIG = { proxyHost: 'localhost', proxyPort: 3001, kosHost: '192.168.1.1', kosPort: 5410 };

const MENU_WITH_CPUS = [
  'Terminal: type = XTERM-256COLOR, size = 123x18',
  '__________________________________________________________________________',
  '                        Pick Open Telnets  Vessel Name (CPU tagname)',
  '                        ---- ---- -------  --------------------------------',
  '                         [1]   no    0     Untitled Space Craft (KAL9000(system))',
  '                         [2]   no    0     Untitled Space Craft (KAL9000(console))',
  '--------------------------------------------------------------------------',
  'Choose a CPU to attach to by typing a selection number and pressing return/enter.',
  '--------------------------------------------------------------------------',
].join('\n');

describe('KosTerminal', () => {
  it('connects to the proxy WebSocket with the correct URL on mount', async () => {
    const connected = new Promise<string>((resolve) => {
      server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
        resolve(String(client.url));
      }));
    });

    render(<KosTerminalComponent config={DEFAULT_CONFIG} />);

    const url = await connected;
    expect(url).toContain('host=192.168.1.1');
    expect(url).toContain('port=5410');
  });

  it('writes incoming proxy messages to the terminal', async () => {
    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.send('Hello from kOS!\r\n');
    }));

    render(<KosTerminalComponent config={DEFAULT_CONFIG} />);

    await waitFor(() => {
      expect(termSpies.write).toHaveBeenCalledWith('Hello from kOS!\r\n');
    });
  });

  it('sends user input through the WebSocket', async () => {
    const received: string[] = [];

    const clientReady = new Promise<void>((resolve) => {
      server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
        client.addEventListener('message', ({ data }) => received.push(data as string));
        resolve();
      }));
    });

    render(<KosTerminalComponent config={DEFAULT_CONFIG} />);
    await clientReady;

    // Retrieve the onData callback registered by the component and simulate typing
    await waitFor(() => expect(termSpies.onData).toHaveBeenCalled());
    const onDataHandler = vi.mocked(termSpies.onData).mock.calls[0][0] as (data: string) => void;
    onDataHandler('PRINT "hello".\n');

    await waitFor(() => expect(received).toContain('PRINT "hello".\n'));
  });

  it('does not register an onData handler when readOnly is true', async () => {
    const clientReady = new Promise<void>((resolve) => {
      server.use(kosProxyWs.addEventListener('connection', () => resolve()));
    });

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, readOnly: true }} />);
    await clientReady;
    await new Promise((r) => setTimeout(r, 20));

    expect(termSpies.onData).not.toHaveBeenCalled();
  });

  it('does not forward keystrokes when readOnly is true', async () => {
    const received: string[] = [];

    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => received.push(data as string));
    }));

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, readOnly: true }} />);
    await new Promise((r) => setTimeout(r, 20));

    // No onData handler — simulating typing has no effect
    expect(termSpies.onData).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  it('auto-selects the named CPU when the menu arrives', async () => {
    const received: string[] = [];

    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => received.push(data as string));
      client.send(MENU_WITH_CPUS);
    }));

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, cpuName: 'console' }} />);

    await waitFor(() => expect(received).toContain('2\n'));
  });

  it('still renders the menu in the terminal when auto-selecting', async () => {
    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.send(MENU_WITH_CPUS);
    }));

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, cpuName: 'console' }} />);

    await waitFor(() => {
      expect(termSpies.write).toHaveBeenCalledWith(expect.stringContaining('KAL9000'));
    });
  });

  it('does not auto-select when the named CPU is not in the menu', async () => {
    const received: string[] = [];

    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => received.push(data as string));
      client.send(MENU_WITH_CPUS);
    }));

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, cpuName: 'navigation' }} />);
    await new Promise((r) => setTimeout(r, 40));

    // Should not have sent any selection — wrong CPU name
    expect(received.filter((m) => /^\d+\n$/.test(m))).toHaveLength(0);
  });

  it('auto-selects after a list-changed event resets the menu buffer', async () => {
    const received: string[] = [];

    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('message', ({ data }) => received.push(data as string));
      // First: send a partial/empty menu, then a list-changed + full menu
      client.send('some partial output without the header');
      setTimeout(() => {
        client.send(`--(List of CPU's has Changed)--\n${MENU_WITH_CPUS}`);
      }, 10);
    }));

    render(<KosTerminalComponent config={{ ...DEFAULT_CONFIG, cpuName: 'system' }} />);

    await waitFor(() => expect(received).toContain('1\n'));
  });

  it('closes the WebSocket when the component unmounts', async () => {
    const events: string[] = [];
    server.use(kosProxyWs.addEventListener('connection', ({ client }) => {
      client.addEventListener('close', () => events.push('closed'));
    }));

    const { unmount } = render(<KosTerminalComponent config={DEFAULT_CONFIG} />);
    await new Promise((r) => setTimeout(r, 20));
    unmount();

    await waitFor(() => expect(events).toContain('closed'));
  });
});
