/**
 * A single action-to-input binding. Maps one dashboard-component action
 * (identified by its instance id + action id) to one device input.
 */
export interface InputBinding {
  deviceId: string;
  inputId: string;
}

/** Action id → binding. Missing/null entries mean "unbound". */
export type InputMappings = Record<string, InputBinding | null>;
