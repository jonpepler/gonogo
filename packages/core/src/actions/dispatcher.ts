import type { ActionInputPayload } from "../types";

export type ActionHandler = (payload: ActionInputPayload) => unknown;

const handlers = new Map<string, Map<string, ActionHandler>>();

function keyFor(instanceId: string): Map<string, ActionHandler> {
  let bucket = handlers.get(instanceId);
  if (!bucket) {
    bucket = new Map();
    handlers.set(instanceId, bucket);
  }
  return bucket;
}

export function registerActionHandler(
  instanceId: string,
  actionId: string,
  handler: ActionHandler,
): void {
  keyFor(instanceId).set(actionId, handler);
}

export function unregisterActionHandler(
  instanceId: string,
  actionId: string,
): void {
  const bucket = handlers.get(instanceId);
  if (!bucket) return;
  bucket.delete(actionId);
  if (bucket.size === 0) handlers.delete(instanceId);
}

/**
 * Fires the handler registered for `instanceId`/`actionId` if one exists and
 * returns its value (for the render-output path). Unknown actions are a no-op
 * and return `undefined`.
 */
export function dispatchAction(
  instanceId: string,
  actionId: string,
  payload: ActionInputPayload,
): unknown {
  const handler = handlers.get(instanceId)?.get(actionId);
  if (!handler) return undefined;
  return handler(payload);
}

/** Test-only: wipe all registered handlers. */
export function clearActionHandlers(): void {
  handlers.clear();
}
