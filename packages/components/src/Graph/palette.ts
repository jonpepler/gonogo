export const GRAPH_PALETTE = [
  "#00ff88",
  "#4499ff",
  "#ff8c00",
  "#cc44cc",
  "#ff4466",
  "#00cccc",
  "#cccc00",
  "#ff6633",
] as const;

export function paletteColor(index: number): string {
  return GRAPH_PALETTE[index % GRAPH_PALETTE.length];
}
