import { ws } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { KosDataSource } from "../dataSources/kos";

const kosProxyWs = ws.link("ws://localhost:3001/kos");
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const MENU_WITH_CPUS = [
  "Terminal: type = XTERM-256COLOR, size = 123x18",
  "__________________________________________________________________________________________________________________________",
  "                        Menu GUI   Other",
  "                        Pick Open Telnets  Vessel Name (CPU tagname)",
  "                        ---- ---- -------  --------------------------------",
  "                         [1]   no    0     Untitled Space Craft (KAL9000(system))",
  "                         [2]   no    0     Untitled Space Craft (KAL9000(console))",
  "--------------------------------------------------------------------------------------------------------------------------",
  "Choose a CPU to attach to by typing a selection number and pressing return/enter.",
  "--------------------------------------------------------------------------------------------------------------------------",
].join("\n");

const MENU_NO_CPUS = [
  "Terminal: type = XTERM-256COLOR, size = 123x18",
  "__________________________________________________________________________________________________________________________",
  "                                   Pick Open Telnets  Vessel Name (CPU tagname)",
  "                                   ---- ---- -------  --------------------------------",
  "                                                                  <NONE>",
].join("\n");

const LIST_CHANGED_THEN_MENU = [
  "--(List of CPU's has Changed)--",
  "Terminal: type = XTERM-256COLOR, size = 123x18",
  "__________________________________________________________________________________________________________________________",
  "                        Pick Open Telnets  Vessel Name (CPU tagname)",
  "                        ---- ---- -------  --------------------------------",
  "                         [1]   no    0     Untitled Space Craft (KAL9000(system))",
  "                         [2]   no    0     Untitled Space Craft (KAL9000(console))",
  "--------------------------------------------------------------------------------------------------------------------------",
  "Choose a CPU to attach to by typing a selection number and pressing return/enter.",
  "--------------------------------------------------------------------------------------------------------------------------",
].join("\n");

type ServerClient = { send: (data: string) => void; close: () => void };

function makeSource(cpuName: string) {
  return new KosDataSource(
    {
      host: "localhost",
      port: 3001,
      kosHost: "localhost",
      kosPort: 5410,
      cpuName,
    },
    { retryIntervalMs: 50, retryTimeoutMs: 500 },
  );
}

function captureClient(): Promise<ServerClient> {
  return new Promise((resolve) => {
    server.use(
      kosProxyWs.addEventListener("connection", ({ client }) => {
        resolve(client as ServerClient);
      }),
    );
  });
}

describe("KosDataSource CPU auto-selection", () => {
  let source: KosDataSource;

  beforeEach(() => {
    source = makeSource("console");
  });

  afterEach(() => {
    source.disconnect();
  });

  it("stays reconnecting after connect() until the CPU menu is processed", async () => {
    const clientP = captureClient();
    const connecting = source.connect();
    const [client] = await Promise.all([clientP, connecting]);

    expect(source.status).toBe("reconnecting");

    // Send the menu — source should auto-select and become connected
    await new Promise<void>((resolve) => {
      source.onStatusChange((s) => {
        if (s === "connected") resolve();
      });
      client.send(MENU_WITH_CPUS);
    });

    expect(source.status).toBe("connected");
  });

  it("sends the correct selection number for the configured cpuName", async () => {
    const sentMessages: string[] = [];
    // Register status listener before connecting to avoid race with menu delivery
    const connectedP = new Promise<void>((resolve) => {
      source.onStatusChange((s) => {
        if (s === "connected") resolve();
      });
    });

    server.use(
      kosProxyWs.addEventListener("connection", ({ client }) => {
        client.addEventListener("message", ({ data }) =>
          sentMessages.push(data as string),
        );
        client.send(MENU_WITH_CPUS);
      }),
    );

    void source.connect();
    await connectedP;

    expect(sentMessages).toContain("2\n");
  });

  it("keeps waiting when the named CPU is not yet in the menu", async () => {
    const clientP = captureClient();
    void source.connect();
    const client = await clientP;

    client.send(MENU_NO_CPUS);
    await new Promise((r) => setTimeout(r, 30));

    expect(source.status).toBe("reconnecting");
  });

  it("selects the CPU when the list changes and the CPU appears", async () => {
    const clientP = captureClient();
    void source.connect();
    const client = await clientP;

    // Send empty menu first — CPU not present
    client.send(MENU_NO_CPUS);
    await new Promise((r) => setTimeout(r, 20));
    expect(source.status).toBe("reconnecting");

    // CPU list changes and now includes our CPU
    await new Promise<void>((resolve) => {
      source.onStatusChange((s) => {
        if (s === "connected") resolve();
      });
      client.send(LIST_CHANGED_THEN_MENU);
    });

    expect(source.status).toBe("connected");
  });

  it("re-enters selection mode when the CPU list changes mid-session", async () => {
    const clientP = captureClient();
    void source.connect();
    const client = await clientP;

    // Connect successfully
    await new Promise<void>((resolve) => {
      source.onStatusChange((s) => {
        if (s === "connected") resolve();
      });
      client.send(MENU_WITH_CPUS);
    });
    expect(source.status).toBe("connected");

    // List changes — should drop back to reconnecting
    await new Promise<void>((resolve) => {
      source.onStatusChange((s) => {
        if (s === "reconnecting") resolve();
      });
      client.send("--(List of CPU's has Changed)--\n");
    });
    expect(source.status).toBe("reconnecting");
  });
});
