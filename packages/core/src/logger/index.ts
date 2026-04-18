import type { LogContext, Logger, LogLevel } from "./types";

export class ConsoleLogger implements Logger {
  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error,
  ) {
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
 * reloading. Safe to call from any module — in non-browser contexts (tests,
 * node scripts) it silently does nothing.
 */
export function debugPeer(tag: string, context?: LogContext) {
  try {
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem("DEBUG_PEER") !== "1") return;
    logger.debug(`[peer] ${tag}`, context);
  } catch {
    /* localStorage unavailable */
  }
}

import { handleError as genericHandleError } from "./error-handler";
export function handleError(error: unknown) {
  genericHandleError(error, logger);
}
