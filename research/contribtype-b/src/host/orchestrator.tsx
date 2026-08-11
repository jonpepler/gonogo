// The orchestrator wraps each widget in a WidgetHost carrying the id it already
// has in hand. One line, in one place, for every widget that will ever exist:
// this is what lets a slot component learn its widget id without any widget
// author passing one down.

import { WidgetHost } from "../ui-kit";
import { getComponents } from "./registry";
import "./IsruWidgets";
import "./ResourceOps";
import "./ShipMap";

export function Dashboard() {
  return (
    <div>
      {getComponents().map((def) => (
        <WidgetHost key={def.id} widgetId={def.id}>
          <def.component />
        </WidgetHost>
      ))}
    </div>
  );
}
