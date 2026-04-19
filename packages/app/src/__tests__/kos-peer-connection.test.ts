import { describe, expect, it, vi } from "vitest";
import { KosPeerConnection } from "../peer/KosPeerConnection";

function makeFakeClient() {
  const kosOpenedListeners = new Set<(sessionId: string) => void>();
  const kosDataListeners = new Set<
    (sessionId: string, data: string) => void
  >();
  const kosCloseListeners = new Set<(sessionId: string) => void>();
  const connStatusListeners = new Set<(status: string) => void>();

  return {
    onKosOpened: vi.fn((cb: (sessionId: string) => void) => {
      kosOpenedListeners.add(cb);
      return () => kosOpenedListeners.delete(cb);
    }),
    onKosData: vi.fn((cb: (sessionId: string, data: string) => void) => {
      kosDataListeners.add(cb);
      return () => kosDataListeners.delete(cb);
    }),
    onKosClose: vi.fn((cb: (sessionId: string) => void) => {
      kosCloseListeners.add(cb);
      return () => kosCloseListeners.delete(cb);
    }),
    onConnectionStatus: vi.fn((cb: (status: string) => void) => {
      connStatusListeners.add(cb);
      return () => connStatusListeners.delete(cb);
    }),
    sendKosOpen: vi.fn(),
    sendKosData: vi.fn(),
    sendKosClose: vi.fn(),
    _emitOpened(sid: string) {
      kosOpenedListeners.forEach((cb) => {
        cb(sid);
      });
    },
    _emitData(sid: string, data: string) {
      kosDataListeners.forEach((cb) => {
        cb(sid, data);
      });
    },
    _emitClose(sid: string) {
      kosCloseListeners.forEach((cb) => {
        cb(sid);
      });
    },
    _emitConnStatus(status: string) {
      connStatusListeners.forEach((cb) => {
        cb(status);
      });
    },
    _kosOpenedListenerCount: () => kosOpenedListeners.size,
    _kosDataListenerCount: () => kosDataListeners.size,
    _kosCloseListenerCount: () => kosCloseListeners.size,
  };
}

const params = { kosHost: "localhost", kosPort: 5410, cols: 80, rows: 24 };

describe("KosPeerConnection", () => {
  it("constructor sends kos-open and registers listeners on the client", () => {
    const client = makeFakeClient();
    new KosPeerConnection("sess-1", client as never, params);

    expect(client.sendKosOpen).toHaveBeenCalledWith("sess-1", params);
    expect(client._kosOpenedListenerCount()).toBe(1);
    expect(client._kosDataListenerCount()).toBe(1);
    expect(client._kosCloseListenerCount()).toBe(1);
  });

  it("transitions to OPEN and emits open event when matching kos-opened arrives", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    const opens: unknown[] = [];
    kpc.addEventListener("open", () => opens.push(1));

    expect(kpc.readyState).toBe(WebSocket.CONNECTING);
    client._emitOpened("sess-1");
    expect(kpc.readyState).toBe(WebSocket.OPEN);
    expect(opens).toEqual([1]);
  });

  it("ignores kos-opened / kos-data / kos-close for other sessionIds", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    const messages: unknown[] = [];
    const closes: unknown[] = [];
    kpc.addEventListener("message", (e) => messages.push(e.data));
    kpc.addEventListener("close", () => closes.push(1));

    client._emitOpened("other-session");
    client._emitData("other-session", "ignored");
    client._emitClose("other-session");

    expect(kpc.readyState).toBe(WebSocket.CONNECTING);
    expect(messages).toEqual([]);
    expect(closes).toEqual([]);
  });

  it("dispatches kos-data to message listeners only for matching session", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);
    client._emitOpened("sess-1");

    const messages: unknown[] = [];
    kpc.addEventListener("message", (e) => messages.push(e.data));

    client._emitData("sess-1", "hello");
    expect(messages).toEqual(["hello"]);
  });

  it("close() sends kos-close even when readyState is CONNECTING", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    expect(kpc.readyState).toBe(WebSocket.CONNECTING);
    kpc.close();

    expect(client.sendKosClose).toHaveBeenCalledWith("sess-1");
    expect(kpc.readyState).toBe(WebSocket.CLOSED);
  });

  it("close() is idempotent — second call does not re-send kos-close", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    kpc.close();
    kpc.close();

    expect(client.sendKosClose).toHaveBeenCalledTimes(1);
  });

  it("incoming kos-close transitions readyState to CLOSED and fires close event", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);
    client._emitOpened("sess-1");

    const closes: unknown[] = [];
    kpc.addEventListener("close", () => closes.push(1));

    client._emitClose("sess-1");
    expect(kpc.readyState).toBe(WebSocket.CLOSED);
    expect(closes).toEqual([1]);
  });

  it("send() is a no-op when not yet OPEN", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    kpc.send("early");
    expect(client.sendKosData).not.toHaveBeenCalled();

    client._emitOpened("sess-1");
    kpc.send("later");
    expect(client.sendKosData).toHaveBeenCalledWith("sess-1", "later");
  });

  it("does not re-send kos-open on the initial 'connected' peer status", () => {
    const client = makeFakeClient();
    new KosPeerConnection("sess-1", client as never, params);

    expect(client.sendKosOpen).toHaveBeenCalledTimes(1); // from constructor

    // Initial peer open fires "connected" once — should NOT re-send
    client._emitConnStatus("connected");
    expect(client.sendKosOpen).toHaveBeenCalledTimes(1);
  });

  it("re-sends kos-open when the peer reconnects after a drop", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    // Initial open sequence
    client._emitConnStatus("connected");
    client._emitOpened("sess-1");
    expect(kpc.readyState).toBe(WebSocket.OPEN);

    const closes: unknown[] = [];
    kpc.addEventListener("close", () => closes.push(1));

    // Peer drops
    client._emitConnStatus("reconnecting");
    expect(kpc.readyState).toBe(WebSocket.CONNECTING);
    expect(closes).toEqual([1]); // UI gets notified of the transient drop

    // Peer comes back — kos-open should re-fire
    client._emitConnStatus("connected");
    expect(client.sendKosOpen).toHaveBeenCalledTimes(2);
    expect(client.sendKosOpen).toHaveBeenLastCalledWith("sess-1", params);

    // And a fresh kos-opened restores OPEN state
    const opens: unknown[] = [];
    kpc.addEventListener("open", () => opens.push(1));
    client._emitOpened("sess-1");
    expect(kpc.readyState).toBe(WebSocket.OPEN);
    expect(opens).toEqual([1]);
  });

  it("after explicit close(), ignores subsequent peer reconnects", () => {
    const client = makeFakeClient();
    new KosPeerConnection("sess-1", client as never, params).close();

    // Make sure the "initial connected" bookkeeping is out of the way, then
    // simulate a peer cycle — close() should suppress any re-sends.
    client._emitConnStatus("connected");
    client._emitConnStatus("reconnecting");
    client._emitConnStatus("connected");

    // Only the constructor send + the close send — never a re-open.
    expect(client.sendKosOpen).toHaveBeenCalledTimes(1);
    expect(client.sendKosClose).toHaveBeenCalledTimes(1);
  });

  it("after host-initiated kos-close, ignores subsequent peer reconnects", () => {
    const client = makeFakeClient();
    const kpc = new KosPeerConnection("sess-1", client as never, params);

    client._emitConnStatus("connected");
    client._emitOpened("sess-1");

    // Host says the PTY died
    client._emitClose("sess-1");
    expect(kpc.readyState).toBe(WebSocket.CLOSED);

    // Further peer cycles must not re-open
    client._emitConnStatus("reconnecting");
    client._emitConnStatus("connected");
    expect(client.sendKosOpen).toHaveBeenCalledTimes(1);
  });
});
