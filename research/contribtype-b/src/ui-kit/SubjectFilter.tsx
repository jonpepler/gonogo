// VARIANT B's slot component. Compare with `Filter.tsx`:
//
//   - it needs no widget id at all, so nothing has to be provided by context and
//     nothing has to be composed from three parts
//   - its `subject` prop is a checked token rather than a free string, so the
//     whole slot id is made of things the compiler already knows
//   - its rows are typed from that same token, which is the thing pure
//     component-only keying could not do
//
// The `name` prop survives, demoted: it labels the fieldset and distinguishes
// two bars on screen, but it is no longer part of the slot id, so nobody outside
// has to know it exists.

import { useEffect, useRef } from "react";
import type {
  EntryFn,
  FilterEntry,
  SubjectId,
  SubjectOfId,
  SubjectToken,
} from "../sdk";
import { announceSlotInstance, getContributionsForSlot } from "../sdk";
import { useOptionalWidgetId } from "./widgetContext";

interface SubjectFilterEntryFn extends EntryFn {
  readonly entry: FilterEntry<this["subject"]>;
}

declare module "../sdk/types" {
  interface SlotComponentRegistry {
    "subject-filter": SubjectFilterEntryFn;
  }
}

export function SubjectFilter<S extends SubjectId>({
  subject,
  name,
  onChange,
}: {
  subject: SubjectToken<S>;
  name: string;
  onChange?: (
    predicates: readonly ((item: SubjectOfId<S>) => boolean)[],
  ) => void;
}) {
  const slotId = `subject-filter.${subject.subjectId}`;
  // A contribution may narrow itself to one widget; both lists feed one bar, so
  // the broad case needs no widget id at all and the narrow case needs no
  // separate slot.
  const widgetId = useOptionalWidgetId();
  const scopedSlotId = widgetId === null ? null : `${slotId}@${widgetId}`;

  useEffect(
    () =>
      announceSlotInstance({
        slotId,
        componentId: "subject-filter",
        keying: "subject",
        name: subject.subjectId,
        widgetId: widgetId ?? undefined,
      }),
    [slotId, subject.subjectId, widgetId],
  );

  const entries = [
    ...getContributionsForSlot(slotId),
    ...(scopedSlotId === null ? [] : getContributionsForSlot(scopedSlotId)),
  ].flatMap((def) => def.compute({}) ?? []) as readonly FilterEntry<
    SubjectOfId<S>
  >[];

  // See Filter.tsx: the callback is read through a ref so an inline arrow at the
  // use site cannot turn this effect into an update loop.
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

SubjectFilter.componentId = "subject-filter" as const;
