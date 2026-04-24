import { LogRingBuffer } from "./ringBuffer";
import { tagRegistry } from "./tags";
import type {
  LogContext,
  LogEntry,
  Logger,
  LogLevel,
  TaggedLogger,
} from "./types";

function defaultEnabled(): boolean {
  // Suppress output in test runs so unit + integration suites stay quiet.
  // Opt back in with `logger.setEnabled(true)` or the `GONOGO_LOG=1` env flag.
  try {
    const env = (globalThis as { process?: { env?: Record<string, string> } })
      .process?.env;
    if (env?.GONOGO_LOG === "1") return true;
    if (env?.NODE_ENV === "test") return false;
  } catch {
    // ignore env access failures
  }
  return true;
}

// Numeric ordering so a threshold check is a single comparison.
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function isLogLevel(v: string): v is LogLevel {
  return v === "debug" || v === "info" || v === "warn" || v === "error";
}

function defaultLevel(): LogLevel {
  // Browser: `localStorage.LOG_LEVEL = 'warn'` then reload.
  // Node:    `LOG_LEVEL=warn` in the env.
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    const fromLs = ls?.getItem("LOG_LEVEL");
    if (fromLs && isLogLevel(fromLs)) return fromLs;
  } catch {
    // ignore — localStorage may be unavailable in SSR / node
  }
  try {
    const env = (globalThis as { process?: { env?: Record<string, string> } })
      .process?.env;
    const fromEnv = env?.LOG_LEVEL;
    if (fromEnv && isLogLevel(fromEnv)) return fromEnv;
  } catch {
    // ignore
  }
  return "debug";
}

export class ConsoleLogger implements Logger {
  private enabled: boolean;
  private level: LogLevel;
  private readonly buffer: LogRingBuffer;

  constructor(opts?: {
    enabled?: boolean;
    level?: LogLevel;
    bufferCapacity?: number;
  }) {
    this.enabled = opts?.enabled ?? defaultEnabled();
    this.level = opts?.level ?? defaultLevel();
    this.buffer = new LogRingBuffer(opts?.bufferCapacity);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /** Snapshot of the in-memory ring buffer (oldest first). */
  getBuffer(): readonly LogEntry[] {
    return this.buffer.snapshot();
  }

  /** Serialises the buffer as a pretty-printed JSON array for download. */
  exportLogs(): string {
    return JSON.stringify(this.buffer.snapshot(), null, 2);
  }

  clearBuffer(): void {
    this.buffer.clear();
  }

  tag(name: string): TaggedLogger {
    return {
      debug: (message, context) =>
        this.emit("debug", message, context, undefined, name),
      info: (message, context) =>
        this.emit("info", message, context, undefined, name),
      warn: (message, context) =>
        this.emit("warn", message, context, undefined, name),
      error: (message, error, context) =>
        this.emit("error", message, context, error, name),
    };
  }

  debug(message: string, context?: LogContext) {
    this.emit("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.emit("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.emit("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.emit("error", message, context, error);
  }

  private emit(
    level: LogLevel,
    message: string,
    context: LogContext | undefined,
    error?: Error,
    tag?: string,
  ) {
    if (!this.enabled) return;

    // Tag gating: debug on a tagged logger only prints if the tag is
    // enabled. info/warn/error always pass — a tag is for opt-in verbose
    // tracing, not for hiding operational messages.
    if (tag && level === "debug") {
      if (!tagRegistry.isEnabled(tag)) return;
    }

    // Level floor still applies to everything.
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;

    const entry: LogEntry = {
      level,
      message: tag ? `[${tag}] ${message}` : message,
      timestamp: new Date().toISOString(),
      tag,
      context,
      error: error
        ? { name: error.name, message: error.message, stack: error.stack }
        : undefined,
    };

    // Always buffer — the export is richer than the console stream so
    // operators can retroactively inspect tag-gated entries.
    this.buffer.push(entry);

    const output = JSON.stringify(entry);
    switch (level) {
      case "debug":
      case "info":
        console.log(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }
}

export const logger = new ConsoleLogger();
export { AppError } from "./AppError";
export { ErrorBoundary } from "./ErrorBoundary";
export { LogRingBuffer } from "./ringBuffer";
export { tagRegistry } from "./tags";
export type { LogEntry, TaggedLogger } from "./types";

/**
 * Back-compat wrapper around the new tag system. `debugPeer("foo", ctx)`
 * behaves the same as `logger.tag("peer").debug("foo", ctx)` but stays
 * honouring the legacy `DEBUG_PEER=1` flag so existing docs still work.
 */
const peerLogger = logger.tag("peer");
export function debugPeer(message: string, context?: LogContext) {
  peerLogger.debug(message, context);
}

import { handleError as genericHandleError } from "./error-handler";
export function handleError(error: unknown) {
  genericHandleError(error, logger);
}
