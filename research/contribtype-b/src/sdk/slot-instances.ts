// ---------------------------------------------------------------------------
// The runtime half of the bridge, and the half that is genuinely passive: a
// slot component announces itself here when it mounts, so the app knows every
// slot that exists without any widget having listed anything.
//
// Two jobs:
//   1. tell a contributor that targeted a slot which does not exist, naming the
//      slots that do. This is what covers the one gap the type system cannot:
//      the instance name (see `spike/jsx-expression-type` for why).
//   2. feed the manifest generator, which is just a dump of this map after the
//      probe harness has rendered every widget.
// ---------------------------------------------------------------------------

import { getRegisteredContributionTargets } from "./types";

export interface SlotInstance {
  slotId: string;
  componentId: string;
  name: string;
  /**
   * Which shape the slot id has. A subject-keyed slot still records the widget it
   * happens to be mounted in, because an error that can say WHERE is worth more
   * than one that cannot, but that widget is not part of its key.
   */
  keying: "widget" | "subject";
  widgetId?: string;
}

const mounted = new Map<string, SlotInstance>();
const refCounts = new Map<string, number>();

/** Called by a slot component on mount. The only place a slot is declared. */
export function announceSlotInstance(instance: SlotInstance): () => void {
  mounted.set(instance.slotId, instance);
  refCounts.set(instance.slotId, (refCounts.get(instance.slotId) ?? 0) + 1);
  return () => {
    const next = (refCounts.get(instance.slotId) ?? 1) - 1;
    if (next <= 0) {
      refCounts.delete(instance.slotId);
      mounted.delete(instance.slotId);
      return;
    }
    refCounts.set(instance.slotId, next);
  };
}

export function getMountedSlots(): readonly SlotInstance[] {
  return Array.from(mounted.values());
}

/**
 * Every contribution whose target no slot offers, with the slots that widget
 * DOES offer. Run from a dev-mode check and from a test, so a misaddressed
 * contribution is loud rather than silently inert.
 */
export function findMisaddressedContributions(): {
  target: string;
  didYouMean: readonly string[];
}[] {
  const live = new Set(mounted.keys());
  const out: { target: string; didYouMean: readonly string[] }[] = [];
  for (const target of getRegisteredContributionTargets()) {
    if (live.has(target)) continue;
    const widgetId = target.split(".")[0];
    out.push({
      target,
      didYouMean: Array.from(live).filter((id) =>
        id.startsWith(`${widgetId}.`),
      ),
    });
  }
  return out;
}

/** What the manifest generator emits, keyed the way the interface is shaped. */
export function dumpSlotManifest(): Record<string, Record<string, string[]>> {
  const out: Record<string, Record<string, string[]>> = {};
  for (const instance of mounted.values()) {
    // Subject-keyed slots need no manifest: their ids are already fully
    // enumerable from the component and subject registries.
    if (instance.keying !== "widget" || instance.widgetId === undefined) {
      continue;
    }
    out[instance.widgetId] ??= {};
    const byComponent = out[instance.widgetId] as Record<string, string[]>;
    byComponent[instance.componentId] ??= [];
    byComponent[instance.componentId]?.push(instance.name);
  }
  return out;
}

export function clearSlotInstances(): void {
  mounted.clear();
  refCounts.clear();
}
