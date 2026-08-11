import { useWidgetMeta } from "../contexts/WidgetMetaContext";

/**
 * The host widget's slot id for `segment`: `<componentId>.<segment>`, or null
 * outside a widget (a bare test, a panel outside the dashboard).
 *
 * This is the one irreducible fact of a component-owned slot: a reusable
 * component cannot statically know which widget will mount it, so it declares
 * only the SEGMENT and the id completes from `WidgetMetaContext` at mount,
 * exactly the way the automatic `${componentId}.badges` slot always has
 * (see `useWidgetBadges`). The completed id is a runtime string, so a
 * component reads it with `useContributionsBySlotId` and asserts its own
 * entry type, the same documented posture as badges.
 */
export function useWidgetSlotId(segment: string): string | null {
  const meta = useWidgetMeta();
  return meta ? `${meta.componentId}.${segment}` : null;
}
