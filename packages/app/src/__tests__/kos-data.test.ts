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
  vi,
} from "vitest";
import { KosDataSource } from "../dataSources/kos";

const kosProxyWs = ws.link("ws://localhost:3001/kos");
const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeSource() {
  return new KosDataSource({ host: "localhost", port: 3001 });
}

describe("KosDataSource data protocol", () => {
  let source: KosDataSource;
  let serverClient: { send: (data: string) => void; close: () => void } | null;

  beforeEach(async () => {
    serverClient = null;
    server.use(
      kosProxyWs.addEventListener("connection", ({ client }) => {
        serverClient = client;
      }),
    );
    source = makeSource();
    await source.connect();
  });

  afterEach(() => {
    source.disconnect();
  });

  it("dispatches a key=value line to the matching subscriber", async () => {
    const cb = vi.fn();
    source.subscribe("altitude", cb);

    await new Promise<void>((resolve) => {
      const original = cb.getMockImplementation();
      cb.mockImplementation((...args) => {
        original?.(...args);
        resolve();
      });
      serverClient?.send("altitude=1000\n");
    });

    expect(cb).toHaveBeenCalledWith("1000");
  });

  it("dispatches each line in a multi-line message to the right subscriber", async () => {
    const altCb = vi.fn();
    const velCb = vi.fn();
    source.subscribe("altitude", altCb);
    source.subscribe("velocity", velCb);

    await new Promise<void>((resolve) => {
      let count = 0;
      const check = () => {
        if (++count === 2) resolve();
      };
      altCb.mockImplementation(check);
      velCb.mockImplementation(check);
      serverClient?.send("altitude=500\nvelocity=120\n");
    });

    expect(altCb).toHaveBeenCalledWith("500");
    expect(velCb).toHaveBeenCalledWith("120");
  });

  it("ignores lines that are not key=value format", async () => {
    const cb = vi.fn();
    source.subscribe("altitude", cb);

    // Send a valid line after a malformed one to confirm no error is thrown
    await new Promise<void>((resolve) => {
      cb.mockImplementation(() => resolve());
      serverClient?.send("Welcome to kOS!\naltitude=999\n");
    });

    expect(cb).toHaveBeenCalledWith("999");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("stops dispatching after unsubscribe", async () => {
    const cb = vi.fn();
    const unsub = source.subscribe("altitude", cb);
    unsub();

    serverClient?.send("altitude=1000\n");
    // Give the message time to arrive
    await new Promise((r) => setTimeout(r, 20));

    expect(cb).not.toHaveBeenCalled();
  });

  it("sends execute actions verbatim as plain text", async () => {
    const received = new Promise<string>((resolve) => {
      server.use(
        kosProxyWs.addEventListener("connection", ({ client }) => {
          client.addEventListener("message", ({ data }) =>
            resolve(data as string),
          );
        }),
      );
    });

    // Reconnect so the new handler captures messages
    source.disconnect();
    await source.connect();
    await source.execute('print "hello".');

    expect(await received).toBe('print "hello".');
  });
});
