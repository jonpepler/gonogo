import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { registerKosBridge } from "./bridge.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(websocket);

registerKosBridge(fastify, {
  kosHost: process.env.KOS_HOST ?? "localhost",
  kosPort: Number(process.env.KOS_PORT ?? 5410),
});

fastify.get("/status", async () => {
  return { status: "ok" };
});

const port = Number(process.env.PORT ?? 3001);
await fastify.listen({ port, host: "0.0.0.0" });

console.log(`gonogo proxy running on port ${port}`);
