// The app-side component registry, cut down to the shape that matters here.
//
// Note what a widget's registration does NOT contain: any mention of the slot
// components it renders, or of their instance names. That is the whole point of
// goal 2, and it is why this file is so short.

import type { ComponentType } from "react";

export interface ComponentDefinition {
  id: string;
  name: string;
  component: ComponentType<Record<string, never>>;
}

const components = new Map<string, ComponentDefinition>();

export function registerComponent(def: ComponentDefinition): void {
  components.set(def.id, def);
}

export function getComponents(): readonly ComponentDefinition[] {
  return Array.from(components.values());
}
