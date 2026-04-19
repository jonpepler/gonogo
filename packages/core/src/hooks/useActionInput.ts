import { useEffect } from "react";
import {
  registerActionHandler,
  unregisterActionHandler,
} from "../actions/dispatcher";
import { useDashboardItemId } from "../contexts/DashboardItemContext";
import type { ActionDefinition, ActionHandlers } from "../types";

/**
 * Wire up a component's declared actions to real handlers. The component's
 * instance ID comes from the enclosing `DashboardItemContext`, so call sites
 * don't pass it explicitly:
 *
 *     const actions = [
 *       { id: "toggle", label: "Toggle", accepts: ["button"] },
 *     ] as const satisfies readonly ActionDefinition[];
 *
 *     useActionInput<typeof actions>({
 *       toggle: () => { handleToggle(); return { on: isOn }; },
 *     });
 *
 * Handlers are re-registered whenever they change (e.g. closures capturing
 * fresh state), so the dispatcher always invokes the latest version.
 */
export function useActionInput<TActions extends readonly ActionDefinition[]>(
  handlers: ActionHandlers<TActions>,
): void {
  const instanceId = useDashboardItemId();

  useEffect(() => {
    const entries = Object.entries(handlers) as Array<
      [string, ActionHandlers<TActions>[keyof ActionHandlers<TActions>]]
    >;
    for (const [actionId, handler] of entries) {
      registerActionHandler(instanceId, actionId, handler);
    }
    return () => {
      for (const [actionId] of entries) {
        unregisterActionHandler(instanceId, actionId);
      }
    };
  }, [instanceId, handlers]);
}
