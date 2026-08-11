// Stands for the orchestrator's GridItemContent: mounts WidgetMetaContext and
// ContributionsProvider around every widget. Already exists in the real tree;
// the component-led layer needs NOTHING new from it (the MountedSlotsStore is
// created inside ContributionsProvider).
import type { ReactElement, ReactNode } from "react";
import type { ContributionSlotId } from "./contributions";
import { ContributionsProvider } from "./contributionsRuntime";
import { WidgetMetaContext } from "./WidgetMetaContext";

export function WidgetHost({
  widgetId,
  contributionSlots = [],
  children,
}: {
  widgetId: string;
  contributionSlots?: readonly ContributionSlotId[];
  children?: ReactNode;
}): ReactElement {
  return (
    <WidgetMetaContext.Provider
      value={{ componentId: widgetId, contributionSlots }}
    >
      <ContributionsProvider>{children}</ContributionsProvider>
    </WidgetMetaContext.Provider>
  );
}
