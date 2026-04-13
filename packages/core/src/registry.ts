import type { ComponentDefinition, DataSource, ThemeDefinition } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const components = new Map<string, ComponentDefinition<any>>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dataSources = new Map<string, DataSource<any>>();
const themes = new Map<string, ThemeDefinition>();

// Generic so that component/defaultConfig pairing is checked at the call site,
// but erased to <any> in the registry so the orchestrator can render any component.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerComponent<TConfig = Record<string, unknown>>(def: ComponentDefinition<TConfig>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  components.set(def.id, def as ComponentDefinition<any>);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerDataSource<TConfig extends Record<string, unknown> = Record<string, unknown>>(source: DataSource<TConfig>): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dataSources.set(source.id, source as DataSource<any>);
}

export function registerTheme(def: ThemeDefinition): void {
  themes.set(def.id, def);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getComponents(): ComponentDefinition<any>[] {
  return Array.from(components.values());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getComponent(id: string): ComponentDefinition<any> | undefined {
  return components.get(id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDataSources(): DataSource<any>[] {
  return Array.from(dataSources.values());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getDataSource(id: string): DataSource<any> | undefined {
  return dataSources.get(id);
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
