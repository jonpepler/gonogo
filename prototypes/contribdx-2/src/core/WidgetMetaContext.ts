// Stands for `packages/core/src/contexts/WidgetMetaContext.ts`, unchanged in
// shape: componentId + the widget-LED declared slot list. The component-led
// layer reads only `componentId`; `contributionSlots` keeps carrying layer 1.
import { createContext, useContext } from "react";
import type { ContributionSlotId } from "./contributions";

export interface WidgetMetaContextValue {
  componentId: string;
  contributionSlots: readonly ContributionSlotId[];
}

export const WidgetMetaContext = createContext<WidgetMetaContextValue | null>(
  null,
);

export function useWidgetMeta(): WidgetMetaContextValue | null {
  return useContext(WidgetMetaContext);
}
