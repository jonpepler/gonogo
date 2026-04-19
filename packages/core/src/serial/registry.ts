import type { DeviceRenderStyle } from "./types";

const renderStyles = new Map<string, DeviceRenderStyle>();

export function registerSerialRenderStyle(style: DeviceRenderStyle): void {
  renderStyles.set(style.id, style);
}

export function getSerialRenderStyle(
  id: string,
): DeviceRenderStyle | undefined {
  return renderStyles.get(id);
}

export function getSerialRenderStyles(): DeviceRenderStyle[] {
  return Array.from(renderStyles.values());
}

/** Test-only: wipe all registered render styles. */
export function clearSerialRenderStyles(): void {
  renderStyles.clear();
}
