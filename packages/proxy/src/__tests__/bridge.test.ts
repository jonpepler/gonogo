import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import net from 'net';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerKosBridge } from '../bridge.js';

describe('kOS WebSocket bridge', () => {
  let fastify: ReturnType<typeof Fastify>;
  let mockKos: net.Server;
  let fastifyPort: number;
  let kosPort: number;

  beforeEach(async () => {
    // Fake kOS telnet server — plain TCP, no protocol negotiation needed
    mockKos = net.createServer();
    await new Promise<void>(r => mockKos.listen(0, '127.0.0.1', r));
    kosPort = (mockKos.address() as net.AddressInfo).port;

    // Fastify with bridge pointed at the fake kOS server
    fastify = Fastify();
    await fastify.register(websocket);
    registerKosBridge(fastify, { kosHost: '127.0.0.1', kosPort });
    await fastify.listen({ port: 0, host: '127.0.0.1' });
    fastifyPort = (fastify.server.address() as net.AddressInfo).port;
  });

  afterEach(async () => {
    await fastify.close();
    await new Promise<void>(r => mockKos.close(r));
  });

  it('connects to the kOS server when a WS client connects', async () => {
    const kosConnected = new Promise<void>(r => mockKos.once('connection', () => r()));

    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos`);
    await kosConnected;
    ws.close();
  });

  it('forwards text sent by the WS client to the kOS socket', async () => {
    const received = new Promise<string>(resolve => {
      mockKos.once('connection', (socket) => {
        socket.once('data', (data) => resolve(data.toString()));
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos`);
    await new Promise(r => ws.addEventListener('open', r));
    ws.send('print("hello").');
    expect(await received).toBe('print("hello").');
    ws.close();
  });

  it('forwards data from the kOS socket to the WS client', async () => {
    const kosConnected = new Promise<net.Socket>(r => mockKos.once('connection', r));

    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos`);
    await new Promise(r => ws.addEventListener('open', r));
    const kosSocket = await kosConnected;

    const wsMessage = new Promise<string>(r => ws.addEventListener('message', e => r(e.data as string)));
    kosSocket.write('altitude: 1000\n');
    expect(await wsMessage).toBe('altitude: 1000\n');
    ws.close();
  });

  it('closes the kOS socket when the WS client disconnects', async () => {
    const kosClosed = new Promise<void>(resolve => {
      mockKos.once('connection', (socket) => {
        socket.once('close', () => resolve());
      });
    });

    const ws = new WebSocket(`ws://127.0.0.1:${fastifyPort}/kos`);
    await new Promise(r => ws.addEventListener('open', r));
    // Brief pause to let the bridge establish the telnet connection
    await new Promise(r => setTimeout(r, 20));
    ws.close();
    await kosClosed;
  });
});
