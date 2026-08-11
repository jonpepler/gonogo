import { createContext, useContext } from "react";
import type { ContributionSlotId } from "../contributions";

/**
 * Identity + declared contribution slots for the widget instance the
 * calling component is mounted inside. Returns null outside a provider (a
 * bare widget/test, or a panel outside the dashboard), same posture as most
 * of this package's optional context hooks. Mounted by the orchestrator
 * (GridItemContent, Task 1.5), next to DashboardItemContext, so
 * ContributionsProvider knows which slots to aggregate for this widget
 * without a second prop threaded everywhere.
 */
export interface WidgetMetaContextValue {
  /** The registered ComponentDefinition.id of the mounted widget. */
  componentId: string;
  /** The widget's own declared ComponentDefinition.contributionSlots, or []. */
  contributionSlots: readonly ContributionSlotId[];
}

export const WidgetMetaContext = createContext<WidgetMetaContextValue | null>(
  null,
);

export function useWidgetMeta(): WidgetMetaContextValue | null {
  return useContext(WidgetMetaContext);
}

/**
 * Widget-scoped slot-id completion: `${componentId}.${segment}`. This is the
 * one irreducible fact of a component-led slot: a reusable component cannot
 * statically know which widget mounts it, so the id's first segment resolves
 * from context at mount, exactly the completion the automatic badges slot
 * already does (`useWidgetBadges`). Serves both extension types: pass the
 * result to `<AugmentSlot name={...}>` for a component-led augment slot, or
 * read it through `useComponentContributions` for a contribution slot.
 * Null outside a widget (a bare mount or test): no slot exists there.
 */
export function useWidgetSlotId(segment: string): string | null {
  const meta = useWidgetMeta();
  return meta ? `${meta.componentId}.${segment}` : null;
}
