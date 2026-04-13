// Core shared types — expand as features are built

import type { ComponentType } from 'react';

export type DataSourceStatus = 'connected' | 'disconnected' | 'reconnecting' | 'error';

export interface DataKey {
  key: string;
  description?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: 'text' | 'number';
  placeholder?: string;
}

export interface ActionGroup {
  name: string;
  /** Telemachus action key to toggle, or null for read-only groups. */
  toggle: string | null;
  /** Telemachus value key to read current state. */
  value: string;
  description: string;
}

/**
 * Base interface for all data sources. TConfig types the config object so that
 * concrete sources can return a typed config from getConfig() and accept a typed
 * config in configure(). The registry erases TConfig to the default so the config
 * panel can work generically against any source.
 *
 * Follows the same generic pattern as ComponentDefinition<TConfig>.
 */
export interface DataSource<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  name: string;
  connect(): Promise<void>;
  disconnect(): void;
  status: DataSourceStatus;
  schema(): DataKey[];
  subscribe(key: string, cb: (value: unknown) => void): () => void;
  onStatusChange(cb: (status: DataSourceStatus) => void): () => void;
  execute(action: string): Promise<void>;
  configSchema(): ConfigField[];
  /** Always accepts Record<string,unknown> so the generic config form can call it without knowing TConfig. */
  configure(config: Record<string, unknown>): void;
  getConfig(): TConfig;
  setupInstructions?(): string | null;
}

export type ComponentBehavior = 'gonogo-participant';

/**
 * Props passed to every registered dashboard component.
 *
 * Components that need a specific config shape should supply TConfig:
 *
 *   function MyWidget({ config }: ComponentProps<{ value: number }>) { … }
 *
 * The default (`Record<string, unknown>`) is kept for backward compat and for
 * the registry, which erases the type parameter when storing components.
 */
export interface ComponentProps<TConfig = Record<string, unknown>> {
  config?: TConfig;
}

/**
 * Registration descriptor for a dashboard component.
 *
 * TConfig ties the component function's expected props to the defaultConfig
 * shape, so TypeScript catches mismatches at registration time:
 *
 *   registerComponent<ActionGroupConfig>({
 *     component: ActionGroupComponent,       // ComponentType<ComponentProps<ActionGroupConfig>>
 *     defaultConfig: { actionGroupId: 'AG1' }, // Partial<ActionGroupConfig> — checked ✓
 *   });
 *
 * The registry stores ComponentDefinition<any> so the orchestrator can render
 * any registered component without knowing its concrete TConfig.
 */
export interface ComponentDefinition<TConfig = Record<string, unknown>> {
  id: string;
  name: string;
  category: string;
  component: ComponentType<ComponentProps<TConfig>>;
  dataRequirements?: string[];
  behaviors?: ComponentBehavior[];
  defaultConfig?: Partial<TConfig>;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  theme: Record<string, unknown>;
}
