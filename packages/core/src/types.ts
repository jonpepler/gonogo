// Core shared types — expand as features are built

import type { ComponentType } from "react";
import type { TelemaachusSchema } from "./schemas/telemachus";

export type DataSourceStatus =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

// ---------------------------------------------------------------------------
// Data source schema registry — extensible via declaration merging
// ---------------------------------------------------------------------------

/**
 * Maps data source IDs to their key→value schema.
 *
 * Built-in schemas are pre-populated here. Third-party packages can add their
 * own data sources by augmenting this interface via declaration merging:
 *
 *   declare module '@gonogo/core' {
 *     interface DataSourceRegistry {
 *       'my-source': MySourceSchema;
 *     }
 *   }
 *
 * Once registered, `useDataValue("my-source", key)` infers the return type
 * from the schema automatically — no manual type parameter needed.
 */
export interface DataSourceRegistry {
  telemachus: TelemaachusSchema;
}

export interface DataKey {
  key: string;
  description?: string;
}

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number";
  placeholder?: string;
}

export interface ActionGroup {
  name: string;
  /** Telemachus action key to toggle, or null for read-only groups. */
  toggle: string | null;
  /** Telemachus value key to read current state. Must be a key in TelemaachusSchema. */
  value: keyof TelemaachusSchema;
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
export interface DataSource<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
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

export type ComponentBehavior = "gonogo-participant";

/**
 * Props passed to every registered dashboard component.
 *
 * Components that need a specific config shape should supply TConfig:
 *
 *   function MyWidget({ config }: ComponentProps<{ value: number }>) { … }
 *
 * The default (`Record<string, unknown>`) is kept for backward compat and for
 * the registry, which erases the type parameter when storing components.
 *
 * - `id`             — the DashboardItem instance ID (stable per placement)
 * - `w` / `h`        — current grid-unit size (column/row spans); use to adapt layout
 * - `onConfigChange` — call to persist inline config edits (e.g. label rename)
 */
export interface ComponentProps<TConfig = Record<string, unknown>> {
  config?: TConfig;
  id: string;
  w?: number;
  h?: number;
  onConfigChange?: (config: TConfig) => void;
}

/**
 * Props passed to a component's config UI (rendered inside a modal).
 *
 * `onSave` should be called with the full new config to persist and close.
 */
export interface ConfigComponentProps<TConfig = Record<string, unknown>> {
  config: TConfig;
  onSave: (config: TConfig) => void;
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
  description: string;
  /** Free-form tags; UI may style known values (e.g. 'telemetry', 'control', 'kos'). */
  tags: string[];
  component: ComponentType<ComponentProps<TConfig>>;
  /** Config UI rendered inside a modal; shown via gear icon in the Dashboard. */
  configComponent?: ComponentType<ConfigComponentProps<TConfig>>;
  /** If true, config modal opens immediately when the component is added from the overlay. */
  openConfigOnAdd?: boolean;
  /** Default grid size when placed from the overlay. Falls back to { w: 3, h: 3 }. */
  defaultSize?: { w: number; h: number };
  dataRequirements?: string[];
  behaviors?: ComponentBehavior[];
  defaultConfig?: Partial<TConfig>;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  theme: Record<string, unknown>;
}
