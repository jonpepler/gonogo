# ── builder ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./
# Proto file is loaded at runtime via @grpc/proto-loader.
COPY protos/ ./protos/

EXPOSE 3002
CMD ["node", "dist/index.js"]
