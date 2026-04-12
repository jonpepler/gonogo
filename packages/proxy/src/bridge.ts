import net from 'net';
import type { FastifyInstance } from 'fastify';

export interface BridgeOptions {
  kosHost?: string;
  kosPort?: number;
}

export function registerKosBridge(
  fastify: FastifyInstance,
  { kosHost = 'localhost', kosPort = 5410 }: BridgeOptions = {},
): void {
  fastify.get('/kos', { websocket: true }, (socket) => {
    const telnet = net.createConnection({ host: kosHost, port: kosPort });

    // Browser → kOS
    socket.on('message', (raw) => {
      telnet.write(raw.toString());
    });

    // kOS → browser
    telnet.on('data', (data: Buffer) => {
      socket.send(data.toString());
    });

    // Either side closing tears down the other
    socket.on('close', () => {
      telnet.destroy();
    });

    telnet.on('close', () => {
      try { socket.close(); } catch { /* already closed */ }
    });

    telnet.on('error', () => {
      try { socket.close(); } catch { /* already closed */ }
    });
  });
}
