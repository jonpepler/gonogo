export type { SeriesType } from "@gonogo/ui";
import type { SeriesType } from "@gonogo/ui";

/** Sentinel `xKey` value meaning "plot against wall-clock time". */
export const TIME_AXIS = "$time";

export interface GraphSeriesConfig {
  id: string;
  key: string;
  /** Render style — only "line" for now. Legacy configs without this field default to "line". */
  type?: SeriesType;
  /** Overrides the key's metadata label. */
  label?: string;
  /** Overrides palette-assigned colour. */
  color?: string;
  axis: "primary" | "secondary" | "auto";
}

export interface GraphConfig {
  series: GraphSeriesConfig[];
  /** Seconds of history to display. Default 300. */
  windowSec: number;
  /**
   * Data key plotted on the X axis, or `TIME_AXIS` (`"$time"`) for wall-clock
   * time. Legacy configs without this field default to time.
   */
  xKey?: string;
  /** Optional pin for primary-axis domain. Falls back to data range when absent. */
  yDomainPrimary?: [number, number];
  /** Optional pin for secondary-axis domain. Falls back to data range when absent. */
  yDomainSecondary?: [number, number];
  /** @deprecated ignored; kept so older persisted configs stay assignable. */
  style?: string;
}
