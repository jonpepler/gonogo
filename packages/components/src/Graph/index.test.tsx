import type { ConfigField, DataKey, DataSource, DataSourceStatus } from "@gonogo/core";
import { clearRegistry, registerDataSource } from "@gonogo/core";
import { BufferedDataSource, MemoryStore } from "@gonogo/data";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphComponent } from "./index";

class MockSource implements DataSource {
  readonly id = "mock";
  readonly name = "Mock";
  status: DataSourceStatus = "disconnected";
  private readonly subs = new Map<string, Set<(v: unknown) => void>>();
  private readonly statusSubs = new Set<(s: DataSourceStatus) => void>();
  private readonly keys: DataKey[];

  constructor(keys: DataKey[]) {
    this.keys = keys;
  }

  async connect(): Promise<void> {
    this.status = "connected";
    this.statusSubs.forEach((cb) => { cb("connected"); });
  }
  disconnect(): void {
    this.status = "disconnected";
    this.statusSubs.forEach((cb) => { cb("disconnected"); });
  }
  schema(): DataKey[] { return this.keys; }
  subscribe(key: string, cb: (v: unknown) => void): () => void {
    let bucket = this.subs.get(key);
    if (!bucket) { bucket = new Set(); this.subs.set(key, bucket); }
    bucket.add(cb);
    return () => { bucket?.delete(cb); };
  }
  onStatusChange(cb: (s: DataSourceStatus) => void): () => void {
    this.statusSubs.add(cb);
    return () => { this.statusSubs.delete(cb); };
  }
  async execute(_action: string): Promise<void> {}
  configSchema(): ConfigField[] { return []; }
  configure(_config: Record<string, unknown>): void {}
  getConfig(): Record<string, unknown> { return {}; }

  emit(key: string, value: unknown): void {
    this.subs.get(key)?.forEach((cb) => { cb(value); });
  }
}

describe("GraphComponent", () => {
  let source: MockSource;
  let buffered: BufferedDataSource;

  beforeEach(async () => {
    clearRegistry();
    vi.stubGlobal("ResizeObserver", class FakeResizeObserver {
      private cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) { this.cb = cb; }
      observe(_el: Element) {
        this.cb(
          [{ contentRect: { width: 400, height: 300 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    });
    source = new MockSource([
      { key: "v.name" },
      { key: "v.missionTime" },
      { key: "v.altitude" },
    ]);
    buffered = new BufferedDataSource({ source, store: new MemoryStore() });
    registerDataSource(buffered);
    await buffered.connect();
  });

  afterEach(() => {
    buffered.disconnect();
    vi.unstubAllGlobals();
  });

  it("renders a <path> with data when a series receives numeric values", async () => {
    const config = {
      style: "time-series" as const,
      series: [{ id: "s1", key: "v.altitude", axis: "auto" as const }],
      windowSec: 300,
    };

    render(<GraphComponent config={config} id="graph-test" />);

    act(() => {
      source.emit("v.name", "Kerbal X");
      source.emit("v.missionTime", 0);
      source.emit("v.altitude", 12_345);
    });

    await waitFor(() => {
      const paths = document.querySelectorAll("path[d]");
      const withData = Array.from(paths).filter(
        (p) => (p.getAttribute("d") ?? "").length > 0,
      );
      expect(withData.length).toBeGreaterThan(0);
    });
  });

  it("shows empty state when no series are configured", () => {
    const config = {
      style: "time-series" as const,
      series: [],
      windowSec: 300,
    };

    const { getByText } = render(<GraphComponent config={config} id="graph-test" />);
    expect(getByText("Configure series to begin graphing.")).toBeInTheDocument();
  });
});
