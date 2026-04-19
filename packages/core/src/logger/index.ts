import type { LogContext, Logger, LogLevel } from "./types";

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

export class ConsoleLogger implements Logger {
  private enabled: boolean;

  constructor(opts?: { enabled?: boolean }) {
    this.enabled = opts?.enabled ?? defaultEnabled();
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
  ) {
    if (!this.enabled) return;
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

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

  debug(message: string, context?: LogContext) {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error, context?: LogContext) {
    this.log("error", message, context, error);
  }
}

export const logger = new ConsoleLogger();
export { AppError } from "./AppError";
export { ErrorBoundary } from "./ErrorBoundary";

/**
 * Flag-gated debug logger for tracing peer / data-source plumbing without
 * flooding normal console output. Activate by running
 * `localStorage.setItem('DEBUG_PEER', '1')` in the browser devtools, then
 * reloading. The flag is resolved once on first call and cached — this runs
 * in the per-message hot path (hundreds of times per second), so each call
 * past the first is a single boolean check.
 */
let debugPeerEnabled: boolean | null = null;
export function debugPeer(tag: string, context?: LogContext) {
  if (debugPeerEnabled === null) {
    try {
      debugPeerEnabled =
        typeof localStorage !== "undefined" &&
        localStorage.getItem("DEBUG_PEER") === "1";
    } catch {
      debugPeerEnabled = false;
    }
  }
  if (!debugPeerEnabled) return;
  logger.debug(`[peer] ${tag}`, context);
}

import { handleError as genericHandleError } from "./error-handler";
export function handleError(error: unknown) {
  genericHandleError(error, logger);
}
