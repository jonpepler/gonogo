// ---------------------------------------------------------------------------
// A slot component. It carries everything about its own contribution slot:
//
//   - its component id, as a static on the function, so `slot(Filter, ...)`
//     reads it out of the TYPE rather than being handed a string
//   - its entry shape, generically, declared once into `SlotComponentRegistry`
//   - its runtime announcement, so the app learns the slot exists purely from
//     the component having been rendered
//
// Nothing here names a widget. The widget id arrives from context, the instance
// name arrives as a prop, so one Filter serves every widget and every instance.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef } from "react";
import type { EntryFn, FilterEntry } from "../sdk";
import { announceSlotInstance, getContributionsForSlot } from "../sdk";
import { useWidgetId } from "./widgetContext";

/** This component's entry shape, at whatever subject the host widget declared. */
interface FilterEntryFn extends EntryFn {
  readonly entry: FilterEntry<this["subject"]>;
}

declare module "../sdk/types" {
  interface SlotComponentRegistry {
    filter: FilterEntryFn;
  }
}

export interface FilterProps {
  /** Distinguishes two Filters in one widget. Becomes the slot's third part. */
  name: string;
  /** Rows to narrow. Typed by the host widget, unrelated to the slot machinery. */
  onChange?: (predicates: readonly ((item: never) => boolean)[]) => void;
}

export function Filter({ name, onChange }: FilterProps) {
  const widgetId = useWidgetId();
  const slotId = `${widgetId}.filter.${name}`;

  useEffect(
    () =>
      announceSlotInstance({
        slotId,
        widgetId,
        componentId: "filter",
        keying: "widget",
        name,
      }),
    [slotId, widgetId, name],
  );

  const entries = useMemo(() => {
    return getContributionsForSlot(slotId).flatMap(
      (def) => def.compute({}) ?? [],
    ) as readonly FilterEntry<never>[];
  }, [slotId]);

  // The callback is read through a ref so an inline arrow at the use site does
  // not make this effect re-run every render, which with a setState inside it is
  // an update loop.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.(entries.map((entry) => entry.predicate));
  }, [entries]);

  return (
    <fieldset>
      <legend>{name}</legend>
      {entries.map((entry) => (
        <button key={entry.id} type="button">
          {entry.label}
        </button>
      ))}
    </fieldset>
  );
}

/** The component id, on the value, so `slot(Filter, ...)` infers it. */
Filter.componentId = "filter" as const;
