// ---------------------------------------------------------------------------
// Stands for a NEW `packages/core/src/componentSlots.ts`: the component-led
// half of the contribution system.
//
// Two pieces:
//
//   registerSlotKind(def)   the passive, render-free declaration in the
//                           spirit of registerComponent / registerUnit. A
//                           slot-bearing component's module calls it once at
//                           load; the ENTRY TYPE rides the sdk's
//                           `SlotKindEntries` seam, this call carries only
//                           the runtime metadata (id, name, docs) that debug
//                           surfaces and the future dev-site list
//
//   MountedSlotsStore       the per-widget-instance record of which
//                           component-led slots are currently mounted. A
//                           slot-bearing component announces
//                           `${widgetId}.${slotKey}` on mount and withdraws
//                           on unmount; ContributionsProvider aggregates the
//                           union of announced + widget-declared slots.
//                           Announce is ref-counted, and a second concurrent
//                           mount of the same unqualified key in one widget
//                           is reported as an author error naming the fix
//                           (qualify with `as`)
// ---------------------------------------------------------------------------

import { createContext } from "react";

export interface SlotKindDefinition {
  /** The slot-key default and the `SlotKindEntries` member name, e.g. "filters". */
  kind: string;
  /** Human label for debug surfaces and the dev-site. */
  name: string;
  description?: string;
}

const slotKinds = new Map<string, SlotKindDefinition>();

/** Declare a slot kind. Module-load, idempotent per def, collision throws. */
export function registerSlotKind(def: SlotKindDefinition): void {
  const existing = slotKinds.get(def.kind);
  if (existing !== undefined) {
    if (existing === def) return;
    throw new Error(
      `Slot kind "${def.kind}" is already registered ("${existing.name}"); ` +
        `slot kinds are a global vocabulary, pick a distinct kind id.`,
    );
  }
  slotKinds.set(def.kind, def);
}

export function getRegisteredSlotKinds(): readonly SlotKindDefinition[] {
  return Array.from(slotKinds.values());
}

/** Test-only reset. */
export function clearSlotKinds(): void {
  slotKinds.clear();
}

// ── Mounted-slot announcements, one store per widget instance ──────────────

export interface MountedSlotsStore {
  /** Ref-counted announce; returns the withdraw function. */
  announce(slotId: string): () => void;
  getSnapshot(): readonly string[];
  subscribe(cb: () => void): () => void;
}

/**
 * Duplicate-mount reports, observable so a test (and a dev overlay) can see
 * them without spying on console. The real tree would use `logger.error`.
 */
const duplicateListeners = new Set<(slotId: string) => void>();
export function onDuplicateMount(cb: (slotId: string) => void): () => void {
  duplicateListeners.add(cb);
  return () => {
    duplicateListeners.delete(cb);
  };
}

// `_widgetId` is kept in the signature for the real tree, where duplicate
// reports and debug surfaces name the owning widget.
export function createMountedSlotsStore(_widgetId: string): MountedSlotsStore {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let snapshot: readonly string[] = Object.freeze([]);

  const notify = () => {
    snapshot = Object.freeze(Array.from(counts.keys()));
    for (const cb of listeners) cb();
  };

  return {
    announce(slotId: string) {
      const next = (counts.get(slotId) ?? 0) + 1;
      counts.set(slotId, next);
      if (next === 2) {
        // Two live mounts of one slot key silently merge their entries, which
        // is never what the widget author meant: the second mount should have
        // qualified its key (`as: "<qualifier>-<kind>"`).
        for (const cb of duplicateListeners) cb(slotId);
      }
      if (next === 1) notify();
      return () => {
        const current = counts.get(slotId) ?? 0;
        if (current <= 1) {
          counts.delete(slotId);
          notify();
        } else {
          counts.set(slotId, current - 1);
        }
      };
    },
    getSnapshot: () => snapshot,
    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };
}

// Provided by ContributionsProvider, read by useComponentSlot. Null outside a
// widget (a bare test render), where component-led slots degrade to inert.
export const MountedSlotsContext = createContext<MountedSlotsStore | null>(
  null,
);
