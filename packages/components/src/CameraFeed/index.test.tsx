import type { DataSourceStatus } from "@gonogo/core";
import {
  clearActionHandlers,
  clearRegistry,
  clearStreamRegistry,
  DashboardItemContext,
  registerStreamSource,
  type StreamInfo,
  type StreamSource,
} from "@gonogo/core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CameraFeedComponent } from "./index";

/**
 * CameraFeed integration test — exercises the widget against a real
 * useStream / useStreamList wired through the StreamRegistry. The only fake
 * is the StreamSource itself (can't produce a real MediaStream in jsdom).
 * Verifies status-driven placeholder text, stream-selection rules, and the
 * cycle/single-mode switch behaviour.
 */

type TestStreamSource = StreamSource & {
  setStreams: (streams: StreamInfo[]) => void;
  setStatus: (status: DataSourceStatus) => void;
  subscribeCalls: string[];
  unsubscribeCalls: string[];
};

function makeSource(id: string, initial: StreamInfo[] = []): TestStreamSource {
  const statusCbs = new Set<(s: DataSourceStatus) => void>();
  const streamsCbs = new Set<(s: StreamInfo[]) => void>();
  let current = initial;
  const subscribeCalls: string[] = [];
  const unsubscribeCalls: string[] = [];

  const source: TestStreamSource = {
    id,
    name: id,
    status: "connected",
    async connect() {},
    disconnect() {},
    listStreams: () => current,
    async subscribe(streamId) {
      subscribeCalls.push(streamId);
      // jsdom doesn't implement MediaStream; an opaque non-null object is
      // enough to flow through the srcObject assignment and trigger the
      // "stream ready" render branch.
      return {} as MediaStream;
    },
    unsubscribe(streamId) {
      unsubscribeCalls.push(streamId);
    },
    onStatusChange(cb) {
      statusCbs.add(cb);
      return () => {
        statusCbs.delete(cb);
      };
    },
    onStreamsChange(cb) {
      streamsCbs.add(cb);
      return () => {
        streamsCbs.delete(cb);
      };
    },
    setStreams(streams) {
      current = streams;
      for (const cb of streamsCbs) cb(streams);
    },
    setStatus(status) {
      source.status = status;
      for (const cb of statusCbs) cb(status);
    },
    subscribeCalls,
    unsubscribeCalls,
  };
  return source;
}

function renderFeed(
  config: Parameters<typeof CameraFeedComponent>[0]["config"] = {},
): ReturnType<typeof render> {
  return render(
    <DashboardItemContext.Provider value={{ instanceId: "camera-test" }}>
      <CameraFeedComponent config={config} id="camera-test" />
    </DashboardItemContext.Provider>,
  );
}

describe("CameraFeedComponent", () => {
  beforeEach(() => {
    clearRegistry();
    clearStreamRegistry();
  });

  afterEach(() => {
    cleanup();
    clearActionHandlers();
    clearStreamRegistry();
  });

  it("renders a placeholder (no video) when the stream list is empty", () => {
    const source = makeSource("ocisly");
    registerStreamSource(source);

    const { container } = renderFeed();
    // With zero streams there is no selected camera → no <video>, only a
    // placeholder. The exact copy depends on useStream's last-seen status;
    // the invariant worth locking in is "no camera video mounted".
    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("renders the video + overlay once a stream is announced and selected", async () => {
    const source = makeSource("ocisly", [
      { id: "cam-1", name: "Hawk", metadata: {} },
    ]);
    registerStreamSource(source);

    const { container } = renderFeed();

    // useStream subscribes asynchronously; wait for the subscribe to land.
    await waitFor(() => {
      expect(source.subscribeCalls).toContain("cam-1");
    });
    // Overlay shows the camera's display name.
    await waitFor(() => {
      expect(container.textContent).toContain("Hawk");
    });
    // Video element mounts.
    expect(container.querySelector("video")).not.toBeNull();
  });

  it("switches to the newly-announced camera when cycle mode rotates", () => {
    vi.useFakeTimers();
    try {
      const source = makeSource("ocisly", [
        { id: "cam-1", name: "Hawk" },
        { id: "cam-2", name: "Falcon" },
      ]);
      registerStreamSource(source);

      const { container } = renderFeed({
        mode: "cycle",
        cycleIntervalMs: 1000,
      });

      // First pass shows cam-1 ("Hawk").
      expect(container.textContent).toContain("CYCLE 2×");

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      // After one cycle tick we should be on cam-2 ("Falcon"). Overlay updates
      // are synchronous with the setState inside the interval callback.
      expect(container.textContent).toContain("Falcon");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reflects 'Proxy disconnected' when the source reports disconnected", async () => {
    const source = makeSource("ocisly", [{ id: "cam-1", name: "Hawk" }]);
    source.status = "disconnected";
    registerStreamSource(source);

    const { container } = renderFeed();
    await waitFor(() => {
      expect(container.textContent).toContain("Proxy disconnected");
    });
  });
});
