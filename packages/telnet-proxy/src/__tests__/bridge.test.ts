import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import net from 'net';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';

// ---------------------------------------------------------------------------
// node-pty mock
// ---------------------------------------------------------------------------
//
// We create a fake IPty that is also an EventEmitter so test code can drive
// onData / onExit callbacks directly, without spawning a real process.

class FakePty extends EventEmitter {
  pid = 99999;
  cols = 80;
  rows = 24;
  process = 'telnet';
  handleFlowControl = false;

  write = vi.fn();
  resize = vi.fn((cols: number, rows: number) => {
    this.cols = cols;
    this.rows = rows;
  });
  kill = vi.fn();
  pause = vi.fn();
  resume = vi.fn();

  // node-pty uses callback-style .onData / .onExit rather than EventEmitter
  onData(cb: (data: string) => void) {
    this.on('data', cb);
    return { dispose: () => this.off('data', cb) };
  }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
    this.on('exit', cb);
    return { dispose: () => this.off('exit', cb) };
  }
}

let fakePty: FakePty;
let spawnArgs: { file: string; args: string[]; options: Record<string, unknown> } | null = null;

vi.mock('node-pty', () => ({
  spawn: (file: string, args: string[], options: Record<string, unknown>) => {
    spawnArgs = { file, args, options };
    fakePty = new FakePty();
    return fakePty;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildServer(kosHost = '127.0.0.1', kosPort = 9999) {
  // Import AFTER mock is registered
  const { registerKosBridge } = await import('../bridge.js');
  const fastify = Fastify({ logger: false });
  await fastify.register(websocket);
  registerKosBridge(fastify, { kosHost, kosPort });
  await fastify.listen({ port: 0, host: '127.0.0.1' });
  const port = (fastify.server.address() as net.AddressInfo).port;
  return { fastify, port };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('kOS WebSocket bridge (PTY)', () => {
  let fastify: Awaited<ReturnType<typeof buildServer>>['fastify'];
  let fastifyPort: number;

  beforeEach(async () => {
    spawnArgs = null;
    vi.resetModules();                      // fresh import so sessions Map is empty
    ({ fastify, port: fastifyPort } = await buildServer());
  });

  afterEach(async () => {
    await fastify.close();
  });

  // -------------------------------------------------------------------------

  it('spawns telnet with the correct host, port, and terminal name', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?host=kos.local&port=5410&id=test-1`);
    await new Promise(r => ws.addEventListener('open', r));

    expect(spawnArgs).not.toBeNull();
    expect(spawnArgs!.file).toBe('telnet');
    expect(spawnArgs!.args).toEqual(['kos.local', '5410']);
    expect(spawnArgs!.options.name).toBe('xterm-256color');

    ws.close();
    await new Promise(r => ws.addEventListener('close', r));
  });

  it('forwards WebSocket messages to the PTY', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?id=test-2`);
    await new Promise(r => ws.addEventListener('open', r));

    ws.send('1\r');
    // Wait for the 300ms input-hold to elapse before the message reaches the PTY
    await new Promise(r => setTimeout(r, 350));

    expect(fakePty.write).toHaveBeenCalledWith('1\r');

    ws.close();
    await new Promise(r => ws.addEventListener('close', r));
  });

  it('forwards PTY data to the WebSocket client', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?id=test-3`);
    await new Promise(r => ws.addEventListener('open', r));

    const received = new Promise<string>(r => ws.addEventListener('message', e => r(e.data as string)));
    // Simulate output from the telnet process
    fakePty.emit('data', 'kOS v1.4.0.0\r\n');

    expect(await received).toBe('kOS v1.4.0.0\r\n');

    ws.close();
    await new Promise(r => ws.addEventListener('close', r));
  });

  it('kills the PTY when the WebSocket client disconnects', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?id=test-4`);
    await new Promise(r => ws.addEventListener('open', r));

    ws.close();
    await new Promise(r => ws.addEventListener('close', r));
    // Give the server-side close handler a tick to run
    await new Promise(r => setTimeout(r, 50));

    expect(fakePty.kill).toHaveBeenCalled();
  });

  it('closes the WebSocket when the PTY process exits', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?id=test-5`);
    await new Promise(r => ws.addEventListener('open', r));

    const wsClosed = new Promise<void>(r => ws.addEventListener('close', r));
    // Simulate the telnet process exiting (e.g. kOS disconnects)
    fakePty.emit('exit', { exitCode: 0 });

    await wsClosed;
  });

  it('resizes the PTY via POST /kos/resize', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos?id=resize-session`);
    await new Promise(r => ws.addEventListener('open', r));

    const resp = await fetch(`http://127.0.0.1:${fastifyPort}/kos/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'resize-session', cols: 120, rows: 40 }),
    });

    expect(resp.status).toBe(204);
    expect(fakePty.resize).toHaveBeenCalledWith(120, 40);

    ws.close();
    await new Promise(r => ws.addEventListener('close', r));
  });

  it('returns 404 from /kos/resize for an unknown session ID', async () => {
    const resp = await fetch(`http://127.0.0.1:${fastifyPort}/kos/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'no-such-session', cols: 80, rows: 24 }),
    });

    expect(resp.status).toBe(404);
  });
});
