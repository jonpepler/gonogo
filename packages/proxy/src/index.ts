import Fastify from 'fastify';
import websocket from '@fastify/websocket';

const fastify = Fastify({ logger: true });

await fastify.register(websocket);

fastify.get('/status', async () => {
  return { status: 'ok' };
});

// kOS telnet bridge — to be implemented
fastify.get('/kos', { websocket: true }, (socket) => {
  socket.send(JSON.stringify({ type: 'status', connected: false, message: 'kOS bridge not yet implemented' }));
  socket.close();
});

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: '0.0.0.0' });

console.log(`gonogo proxy running on port ${port}`);
