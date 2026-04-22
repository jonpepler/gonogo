/**
 * Self-tests for MockKosTelnet. These prove the fixture's own behaviour —
 * without them, bugs in the fixture would silently mask bugs in the data
 * source code that later tests exercise through it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { parseKosMenu } from "../../dataSources/kos-menu-parser";
import { MockKosTelnet, MockKosTelnetSocket } from "./MockKosTelnet";

interface MessageEvent {
  data: string;
}

function newConnection(): {
  ws: MockKosTelnetSocket;
  messages: string[];
} {
  const ws = new WebSocket(
    "ws://localhost:3001/kos?host=localhost&port=5410",
  ) as unknown as MockKosTelnetSocket;
  const messages: string[] = [];
  ws.addEventListener("message", (e) => {
    messages.push((e as MessageEvent).data);
  });
  return { ws, messages };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("MockKosTelnet", () => {
  afterEach(() => {
    MockKosTelnet.uninstall();
  });

  it("installs as globalThis.WebSocket and emits the CPU menu on open", async () => {
    MockKosTelnet.install();
    const { messages } = newConnection();

    await flushMicrotasks();

    expect(messages.length).toBeGreaterThan(0);
    const text = messages.join("");
    const parsed = parseKosMenu(text);
    expect(parsed).not.toBeNull();
    expect(parsed?.cpus).toHaveLength(1);
    expect(parsed?.cpus[0].tagname).toBe("datastream");
  });

  it("renders a menu that the real parseKosMenu accepts, across multiple CPUs", async () => {
    const mock = MockKosTelnet.install();
    mock.setCpus([
      {
        number: 1,
        vesselName: "Test Ship",
        partType: "KAL9000",
        tagname: "datastream",
      },
      {
        number: 2,
        vesselName: "Test Ship",
        partType: "CX-4181",
        tagname: "compute",
      },
    ]);
    const { messages } = newConnection();
    await flushMicrotasks();

    const parsed = parseKosMenu(messages.join(""));
    expect(parsed?.cpus.map((c) => c.tagname)).toEqual([
      "datastream",
      "compute",
    ]);
  });

  it("enters REPL mode after a valid numeric selection", async () => {
    MockKosTelnet.install();
    const { ws, messages } = newConnection();
    await flushMicrotasks();

    messages.length = 0;
    ws.send("1\n");

    expect(ws.mode).toBe("repl");
    expect(ws.attachedCpu?.tagname).toBe("datastream");
    expect(messages.join("")).toContain("Attached to CPU on [datastream]");
  });

  it("ignores invalid numeric selections and stays in menu mode", async () => {
    MockKosTelnet.install();
    const { ws } = newConnection();
    await flushMicrotasks();

    ws.send("99\n");
    expect(ws.mode).toBe("menu");
    expect(ws.attachedCpu).toBeNull();
  });

  it("dispatches a RUN line to the registered handler and emits its output", async () => {
    const mock = MockKosTelnet.install();
    mock.registerScript("add", (inv) => {
      const [a, b] = inv.args.map(Number);
      return `[KOSDATA] result=${a + b} [/KOSDATA]`;
    });

    const { ws, messages } = newConnection();
    await flushMicrotasks();
    ws.send("1\n");
    messages.length = 0;

    ws.send("RUN add(2, 3).\n");
    await flushMicrotasks();

    expect(messages.join("")).toContain("[KOSDATA] result=5 [/KOSDATA]");
    expect(mock.invocations()).toHaveLength(1);
    expect(mock.invocations()[0]).toMatchObject({
      script: "add",
      rawArgs: "2, 3",
      args: ["2", "3"],
    });
  });

  it("emits a kOS-ish error when the script is not registered", async () => {
    MockKosTelnet.install();
    const { ws, messages } = newConnection();
    await flushMicrotasks();
    ws.send("1\n");
    messages.length = 0;

    ws.send("RUN missing().\n");
    await flushMicrotasks();

    expect(messages.join("")).toContain("Cannot open file 'missing'");
  });

  it("supports async script handlers (used for overlap/interval tests)", async () => {
    const mock = MockKosTelnet.install();
    let resolveScript: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      resolveScript = resolve;
    });
    mock.registerScript("slow", () => pending);

    const { ws, messages } = newConnection();
    await flushMicrotasks();
    ws.send("1\n");
    messages.length = 0;

    ws.send("RUN slow().\n");
    await flushMicrotasks();
    // Still no output — handler hasn't resolved.
    expect(messages.join("")).not.toContain("[KOSDATA]");

    resolveScript("[KOSDATA] ok=true [/KOSDATA]");
    await flushMicrotasks();

    expect(messages.join("")).toContain("[KOSDATA] ok=true [/KOSDATA]");
  });

  it("supports multiple concurrent sessions with independent state", async () => {
    const mock = MockKosTelnet.install();
    mock.registerScript("whoami", (inv) => {
      return `[KOSDATA] cpu=${inv.cpu.tagname} [/KOSDATA]`;
    });
    mock.setCpus([
      { number: 1, vesselName: "S", partType: "K", tagname: "alpha" },
      { number: 2, vesselName: "S", partType: "K", tagname: "beta" },
    ]);

    const a = newConnection();
    const b = newConnection();
    await flushMicrotasks();
    a.ws.send("1\n");
    b.ws.send("2\n");
    a.messages.length = 0;
    b.messages.length = 0;

    a.ws.send("RUN whoami().\n");
    b.ws.send("RUN whoami().\n");
    await flushMicrotasks();

    expect(a.messages.join("")).toContain("[KOSDATA] cpu=alpha");
    expect(b.messages.join("")).toContain("[KOSDATA] cpu=beta");
    expect(mock.sessions()).toHaveLength(2);
  });

  it("emitListChanged puts every live session back into menu mode", async () => {
    const mock = MockKosTelnet.install();
    const { ws, messages } = newConnection();
    await flushMicrotasks();
    ws.send("1\n");
    expect(ws.mode).toBe("repl");
    messages.length = 0;

    mock.emitListChanged();

    expect(ws.mode).toBe("menu");
    const text = messages.join("");
    expect(text).toContain("--(List of CPU's has Changed)--");
    expect(parseKosMenu(text)).not.toBeNull();
  });

  it("close() stops further output and reports CLOSED readyState", async () => {
    const mock = MockKosTelnet.install();
    mock.registerScript("echo", () => "[KOSDATA] x=1 [/KOSDATA]");
    const { ws, messages } = newConnection();
    await flushMicrotasks();
    ws.send("1\n");

    ws.close();
    messages.length = 0;
    ws.send("RUN echo().\n");
    await flushMicrotasks();

    expect(ws.readyState).toBe(MockKosTelnetSocket.CLOSED);
    expect(messages.length).toBe(0);
    expect(mock.invocations()).toHaveLength(0);
  });

  it("install() refuses to install twice without uninstall", () => {
    MockKosTelnet.install();
    expect(() => MockKosTelnet.install()).toThrow(/already installed/);
  });

  it("uninstall() restores the original WebSocket", () => {
    const original = globalThis.WebSocket;
    MockKosTelnet.install();
    expect(globalThis.WebSocket).not.toBe(original);
    MockKosTelnet.uninstall();
    expect(globalThis.WebSocket).toBe(original);
  });
});
