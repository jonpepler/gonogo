import type { ComponentDefinition, DataSource, ThemeDefinition } from './types';

const components = new Map<string, ComponentDefinition>();
const dataSources = new Map<string, DataSource>();
const themes = new Map<string, ThemeDefinition>();

export function registerComponent(def: ComponentDefinition): void {
  components.set(def.id, def);
}

export function registerDataSource(source: DataSource): void {
  dataSources.set(source.id, source);
}

export function registerTheme(def: ThemeDefinition): void {
  themes.set(def.id, def);
}

export function getComponents(): ComponentDefinition[] {
  return Array.from(components.values());
}

export function getComponent(id: string): ComponentDefinition | undefined {
  return components.get(id);
}

export function getDataSources(): DataSource[] {
  return Array.from(dataSources.values());
}

export function getThemes(): ThemeDefinition[] {
  return Array.from(themes.values());
}

export function getTheme(id: string): ThemeDefinition | undefined {
  return themes.get(id);
}

/** For use in tests only — resets all registries to empty. */
export function clearRegistry(): void {
  components.clear();
  dataSources.clear();
  themes.clear();
}
