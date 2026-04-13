# ── builder ──────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Build tools required to compile node-pty native bindings from source.
# (Alpine uses musl libc so prebuilt binaries are often unavailable.)
RUN apk add --no-cache python3 make g++

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:24-alpine
WORKDIR /app

# telnet client — the PTY spawns `telnet host port`, so it must be in PATH.
# busybox-extras ships a telnet binary on Alpine.
RUN apk add --no-cache busybox-extras

# Bring in the pre-compiled node_modules (including the node-pty .node binary)
# and the compiled JS output.  No re-install needed in the runtime image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3001
CMD ["node", "dist/index.js"]
