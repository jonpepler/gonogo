// Core shared types — expand as features are built

import type { ComponentType } from 'react';

export type DataSourceStatus = 'connected' | 'disconnected' | 'error';

export interface DataKey {
  key: string;
  description?: string;
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
