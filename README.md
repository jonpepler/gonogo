# gonogo

A mission control SPA for [Kerbal Space Program](https://www.kerbalspaceprogram.com/).

Connect gonogo to your KSP game to get a live telemetry dashboard you can layout, resize, and share across screens.

---

## Prerequisites

### Software

- [Node.js](https://nodejs.org/) v24 (via [nvm](https://github.com/nvm-sh/nvm) — the repo ships an `.nvmrc`)
- [pnpm](https://pnpm.io/) v10+

### KSP Mods

| Mod | Purpose | Required |
|-----|---------|----------|
| [Telemachus Reborn](https://github.com/TelematicusKSP/TelematicusReborn) | Streams telemetry and accepts control commands over HTTP/WebSocket | Yes |
| [kOS](https://ksp-kos.github.io/KOS/) | Scriptable CPU for kOS terminal integration | Only for kOS Terminal component |

---

## Setup

```bash
# 1. Use the right Node version
nvm use

# 2. Install dependencies
pnpm install

# 3. Start the app (Vite dev server)
pnpm dev
```

Open `http://localhost:5173` in your browser.

---

## Connecting to KSP

### Telemachus Reborn

1. Install Telemachus Reborn in your KSP `GameData` folder.
2. Start KSP and load a flight scene.
3. Telemachus starts a server on port `8085` by default.
4. In the gonogo **Data Source Status** panel, set the host to your KSP machine's IP and port `8085`, then click save and reconnect.

The app connects to `ws://host:8085/datalink` for live data and `http://host:8085/telemachus/datalink` for control actions.

### kOS Terminal *(optional)*

The kOS terminal requires the **telnet proxy** — a small server that bridges the browser to kOS's telnet interface.

**Start the proxy:**

```bash
pnpm --filter @gonogo/telnet-proxy dev
# or, in a Docker/Podman environment:
podman compose up
```

The proxy runs on port `3001` by default. It is **entirely optional** — all other features work without it. If the proxy is unreachable the kOS Terminal component will show a connection error and the rest of the dashboard is unaffected.

**Configure:**
- Proxy host/port: configure in the Data Source Status panel under the `kos` data source.
- kOS telnet host/port: defaults to `localhost:5410` (KSP default). Adjust if KSP is on a different machine.

---

## Architecture overview

```
packages/
  core/           — Plugin registry, types, shared logic
  ui/             — Shared UI primitives (Modal, Tag)
  components/     — Built-in dashboard components
  app/            — Vite + React SPA
  telnet-proxy/   — Fastify WebSocket-to-telnet bridge
```

Components self-register via `registerComponent()`. The dashboard renders whatever is registered — there is no hardcoded component list. External packages can add components using the same API.

---

## Adding components

From the dashboard, click the **+** button (bottom-right) to open the component picker. Search by name or tag, click a component to place it, then drag and resize it.

Layouts are saved automatically to `localStorage`.

---

## Contributing

1. Fork the repo and create a branch.
2. Run `pnpm install` and `pnpm dev` to start developing.
3. Run `pnpm test` before submitting — all tests must pass.
4. Run `pnpm lint` to check TypeScript.
5. Open a pull request with a clear description of what changed and why.

CI runs on every PR. There is no required PR template, but include context for reviewers.

---

## Deployment

The app is deployed to GitHub Pages at [jonpepler.github.io/gonogo](https://jonpepler.github.io/gonogo/) on every merge to `main` that passes CI.

To build locally:

```bash
pnpm build
```

Output lands in `packages/app/dist/`.
