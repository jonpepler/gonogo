import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearStreamRegistry, registerStreamSource } from "../streamRegistry";
import type { StreamInfo, StreamSource } from "../streamRegistry";
import type { DataSourceStatus } from "../types";
import { useStream } from "./useStream";
import { useStreamList } from "./useStreamList";

// Minimal in-memory stream source. Doesn't actually produce MediaStreams —
// tests just check ref counting and subscribe plumbing, treating the returned
// value as an opaque handle.
function makeSource(
  id: string,
  streams: StreamInfo[] = [],
): StreamSource & {
  pushStreams: (s: StreamInfo[]) => void;
  setStatus: (s: DataSourceStatus) => void;
  subscribes: string[];
  unsubscribes: string[];
  nextMedia: MediaStream | null;
} {
  const streamsListeners = new Set<(s: StreamInfo[]) => void>();
  const statusListeners = new Set<(s: DataSourceStatus) => void>();
  let currentStreams = streams;

  return {
    id,
    name: id,
    status: "connected" as DataSourceStatus,
    subscribes: [],
    unsubscribes: [],
    nextMedia: {} as MediaStream,
    async connect() {},
    disconnect() {},
    listStreams() {
      return currentStreams;
    },
    async subscribe(streamId) {
      this.subscribes.push(streamId);
      return this.nextMedia;
    },
    unsubscribe(streamId) {
      this.unsubscribes.push(streamId);
    },
    onStatusChange(cb) {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    onStreamsChange(cb) {
      streamsListeners.add(cb);
      return () => streamsListeners.delete(cb);
    },
    pushStreams(next) {
      currentStreams = next;
      for (const cb of streamsListeners) cb(next);
    },
    setStatus(next) {
      this.status = next;
      for (const cb of statusListeners) cb(next);
    },
  };
}

describe("useStream", () => {
  beforeEach(() => {
    clearStreamRegistry();
  });
  afterEach(() => {
    clearStreamRegistry();
  });

  it("subscribes on mount and unsubscribes on unmount", async () => {
    const source = makeSource("ocisly");
    registerStreamSource(source);

    const { unmount } = renderHook(() => useStream("ocisly", "cam-1"));
    await waitFor(() => {
      expect(source.subscribes).toEqual(["cam-1"]);
    });
    expect(source.unsubscribes).toEqual([]);

    unmount();
    expect(source.unsubscribes).toEqual(["cam-1"]);
  });

  it("does not subscribe when streamId is null", () => {
    const source = makeSource("ocisly");
    registerStreamSource(source);

    const { unmount } = renderHook(() =>
      useStream("ocisly", null as unknown as string),
    );
    expect(source.subscribes).toEqual([]);
    unmount();
  });

  it("re-subscribes when the streamId changes", async () => {
    const source = makeSource("ocisly");
    registerStreamSource(source);

    const { rerender, unmount } = renderHook(
      ({ id }: { id: string }) => useStream("ocisly", id),
      { initialProps: { id: "cam-1" } },
    );
    await waitFor(() => {
      expect(source.subscribes).toEqual(["cam-1"]);
    });

    rerender({ id: "cam-2" });
    await waitFor(() => {
      expect(source.subscribes).toEqual(["cam-1", "cam-2"]);
    });
    expect(source.unsubscribes).toEqual(["cam-1"]);

    unmount();
  });

  it("reports status changes from the source", async () => {
    const source = makeSource("ocisly");
    registerStreamSource(source);
    source.setStatus("reconnecting");

    const { result } = renderHook(() => useStream("ocisly", "cam-1"));
    await waitFor(() => {
      expect(result.current.status).toBe("reconnecting");
    });

    act(() => {
      source.setStatus("connected");
    });
    await waitFor(() => {
      expect(result.current.status).toBe("connected");
    });
  });

  it("returns disconnected status when the source is not registered", () => {
    const { result } = renderHook(() => useStream("ocisly", "cam-1"));
    expect(result.current.stream).toBeNull();
    expect(result.current.status).toBe("disconnected");
  });
});

describe("useStreamList", () => {
  beforeEach(() => {
    clearStreamRegistry();
  });
  afterEach(() => {
    clearStreamRegistry();
  });

  it("returns the initial stream list", () => {
    const source = makeSource("ocisly", [
      { id: "cam-1", name: "Forward" },
      { id: "cam-2", name: "Dock" },
    ]);
    registerStreamSource(source);
    const { result } = renderHook(() => useStreamList("ocisly"));
    expect(result.current.map((s) => s.id)).toEqual(["cam-1", "cam-2"]);
  });

  it("updates when the source pushes a new list", async () => {
    const source = makeSource("ocisly", [{ id: "cam-1", name: "Forward" }]);
    registerStreamSource(source);
    const { result } = renderHook(() => useStreamList("ocisly"));
    expect(result.current).toHaveLength(1);

    act(() => {
      source.pushStreams([
        { id: "cam-1", name: "Forward" },
        { id: "cam-2", name: "Dock" },
      ]);
    });
    await waitFor(() => {
      expect(result.current).toHaveLength(2);
    });
  });

  it("returns an empty list when the source is not registered", () => {
    const { result } = renderHook(() => useStreamList("ocisly"));
    expect(result.current).toEqual([]);
  });
});
