export const mapClamped = (
  val: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  const out = ((val - x1) * (y2 - x2)) / (y1 - x1) + x2;
  const min = Math.min(x2, y2);
  const max = Math.max(x2, y2);
  return Math.max(min, Math.min(out, max));
};
