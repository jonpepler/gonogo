// A second slot component, so the machinery is provably not filter-shaped: a
// different entry type, the same three lines of self-declaration.

import { useEffect } from "react";
import type { EntryFn, MeterEntry } from "../sdk";
import { announceSlotInstance, getContributionsForSlot } from "../sdk";
import { useWidgetId } from "./widgetContext";

interface MeterEntryFn extends EntryFn {
  readonly entry: MeterEntry<this["subject"]>;
}

declare module "../sdk/types" {
  interface SlotComponentRegistry {
    meter: MeterEntryFn;
  }
}

export function MeterList({ name }: { name: string }) {
  const widgetId = useWidgetId();
  const slotId = `${widgetId}.meter.${name}`;

  useEffect(
    () =>
      announceSlotInstance({
        slotId,
        widgetId,
        componentId: "meter",
        name,
        keying: "widget",
      }),
    [slotId, widgetId, name],
  );

  const entries = getContributionsForSlot(slotId).flatMap(
    (def) => def.compute({}) ?? [],
  ) as readonly MeterEntry<never>[];

  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry.id}>
          {entry.label}: {entry.amount}/{entry.capacity}
        </li>
      ))}
    </ul>
  );
}

MeterList.componentId = "meter" as const;
