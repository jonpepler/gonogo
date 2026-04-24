/**
 * Feature-detect the Web Serial API. iOS Safari and all iOS browsers lack it;
 * desktop Firefox also does not implement it. Without this guard users just
 * see an empty device list with no hint that their browser is the problem.
 */
export function isWebSerialSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  const serial = (navigator as Navigator & { serial?: unknown }).serial;
  if (!serial) return false;
  return (
    typeof (serial as { requestPort?: unknown }).requestPort === "function"
  );
}
