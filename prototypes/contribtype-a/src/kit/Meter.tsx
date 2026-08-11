// ---------------------------------------------------------------------------
// A SECOND slot-aware component, present only to prove the machinery is not
// filter-shaped. Its entry ignores the host's row type entirely and its props
// differ, and neither fact costs the machinery a special case.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";
import {
  getContributionsForSlot,
  type RowName,
  type SlotSpec,
  slotSpec,
} from "./slots";

export interface MeterEntry {
  partId: string;
  resource: string;
  amount: number;
  capacity: number;
}

export interface MeterProps {
  orientation?: "row" | "column";
}

declare module "./slots" {
  interface SlotKindEntries<Row> {
    meter: MeterEntry;
  }
  interface SlotKindProps<Row> {
    meter: MeterProps;
  }
}

function MeterStack(slotId: string, props: MeterProps): ReactElement | null {
  const entries = getContributionsForSlot(slotId);
  return (
    <div data-slot={slotId} data-orientation={props.orientation ?? "column"}>
      {entries.length}
    </div>
  );
}

export function meterSlot<const Rows extends RowName>(rows: Rows) {
  return <const Topics extends string = never>(
    options: { topics?: readonly Topics[] } = {},
  ): SlotSpec<"meter", Rows, Topics> =>
    slotSpec<"meter", Rows, Topics>(
      "meter",
      rows,
      options.topics ?? [],
      (slotId, props) => MeterStack(slotId, props as MeterProps),
    );
}
