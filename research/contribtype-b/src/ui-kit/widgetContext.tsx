// The widget half of the slot id, supplied by the ORCHESTRATOR rather than by
// the widget author: the dashboard already knows which component definition it
// is rendering, so it wraps every widget in this provider once, in one place.
//
// That is what keeps a slot component reusable. The component reads the widget
// id it happens to be inside; it never names one, and the widget never passes
// one down.

import { createContext, type ReactNode, useContext } from "react";

const WidgetIdContext = createContext<string | null>(null);

export function WidgetHost({
  widgetId,
  children,
}: {
  widgetId: string;
  children: ReactNode;
}) {
  return (
    <WidgetIdContext.Provider value={widgetId}>
      {children}
    </WidgetIdContext.Provider>
  );
}

/** The widget id if there is one. Subject-keyed slots work without it. */
export function useOptionalWidgetId(): string | null {
  return useContext(WidgetIdContext);
}

export function useWidgetId(): string {
  const widgetId = useContext(WidgetIdContext);
  if (widgetId === null) {
    throw new Error(
      "A slot component was rendered outside a WidgetHost, so it has no widget " +
        "id to compose its slot from. The dashboard orchestrator provides this; " +
        'in a test, wrap the widget in <WidgetHost widgetId="...">.',
    );
  }
  return widgetId;
}
