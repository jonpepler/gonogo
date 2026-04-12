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

export interface DataSource {
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
  configure(config: Record<string, unknown>): void;
  getConfig(): Record<string, unknown>;
}

export type ComponentBehavior = 'gonogo-participant';

export interface ComponentDefinition {
  id: string;
  name: string;
  category: string;
  component: ComponentType<ComponentProps>;
  dataRequirements?: string[];
  behaviors?: ComponentBehavior[];
  defaultConfig?: Record<string, unknown>;
}

export interface ComponentProps {
  config?: Record<string, unknown>;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  theme: Record<string, unknown>;
}
