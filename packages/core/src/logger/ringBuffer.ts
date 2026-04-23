import type { LogEntry } from "./types";

/**
 * Fixed-size ring buffer for log entries. Captures every emitted entry
 * — including tag-gated entries the console suppresses — so operators can
 * download a rich trail even when they didn't pre-enable the relevant tag.
 *
 * Eviction: oldest-first, soft-capped via shift() rather than a circular
 * index. At the default capacity (5000) and roughly one push per ms under
 * heavy peer traffic, the shift cost stays negligible against the work
 * those logs were already doing.
 */
export class LogRingBuffer {
  private readonly capacity: number;
  private entries: LogEntry[] = [];

  constructor(capacity = 5000) {
    this.capacity = capacity;
  }

  push(entry: LogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
  }

  snapshot(): LogEntry[] {
    return this.entries.slice();
  }

  clear(): void {
    this.entries = [];
  }

  size(): number {
    return this.entries.length;
  }
}
