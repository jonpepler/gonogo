import * as pty from 'node-pty';
import type { FastifyInstance } from 'fastify';

export interface BridgeOptions {
  kosHost?: string;
  kosPort?: number;
}

// Active PTY sessions, keyed by client-supplied session ID.
const sessions = new Map<string, pty.IPty>();

export function registerKosBridge(
  fastify: FastifyInstance,
  { kosHost = 'localhost', kosPort = 5410 }: BridgeOptions = {},
): void {
  // ---------------------------------------------------------------------------
  // WebSocket ↔ PTY bridge
  // ---------------------------------------------------------------------------
  fastify.get('/kos', { websocket: true }, (socket, request) => {
    const params = request.query as Record<string, string>;
    const host   = params.host ?? kosHost;
    const port   = params.port !== undefined ? parseInt(params.port, 10) : kosPort;
    const id     = params.id ?? crypto.randomUUID();

    request.log.info({ host, port, id }, 'spawning telnet session');

    const term = pty.spawn('telnet', [host, String(port)], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd:  process.env.HOME ?? '/',
      env:  process.env as Record<string, string>,
    });

    sessions.set(id, term);
    request.log.info({ id, pid: term.pid }, 'telnet PTY spawned');

    // PTY → browser
    term.onData((data) => {
      try {
        socket.send(data);
      } catch {
        // WS may have closed between the data arriving and the send
      }
    });

    // PTY exit → close WS
    term.onExit(({ exitCode }) => {
      sessions.delete(id);
      request.log.info({ id, exitCode }, 'telnet PTY exited');
      try { socket.close(); } catch { /* already closed */ }
    });

    // Browser → PTY
    socket.on('message', (raw: Buffer | string) => {
      const data = typeof raw === 'string' ? raw : raw.toString('binary');
      term.write(data);
    });

    // WS close → kill PTY
    socket.on('close', () => {
      sessions.delete(id);
      request.log.info({ id }, 'WS closed — killing PTY');
      try { term.kill(); } catch { /* already dead */ }
    });
  });

  // ---------------------------------------------------------------------------
  // Resize endpoint  POST /kos/resize  { id, cols, rows }
  // ---------------------------------------------------------------------------
  fastify.post('/kos/resize', async (request, reply) => {
    const { id, cols, rows } = request.body as { id: string; cols: number; rows: number };

    if (typeof id !== 'string' || typeof cols !== 'number' || typeof rows !== 'number') {
      return reply.status(400).send({ error: 'id (string), cols (number), rows (number) required' });
    }

    const term = sessions.get(id);
    if (!term) {
      return reply.status(404).send({ error: 'session not found' });
    }

    term.resize(cols, rows);
    return reply.status(204).send();
  });
}
