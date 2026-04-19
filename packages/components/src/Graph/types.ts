export type GraphStyle = "time-series";

export interface GraphSeriesConfig {
  id: string;
  key: string;
  /** Overrides the key's metadata label. */
  label?: string;
  /** Overrides palette-assigned colour. */
  color?: string;
  axis: "primary" | "secondary" | "auto";
}

export interface GraphConfig {
  style: GraphStyle;
  series: GraphSeriesConfig[];
  /** Seconds of history to display. Default 300. */
  windowSec: number;
}
