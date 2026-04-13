import type { ActionGroup } from './types';

export const ACTION_GROUPS = [
  { name: 'SAS',               toggle: 'f.sas',    value: 'v.sasValue',              description: 'SAS state' },
  { name: 'RCS',               toggle: 'f.rcs',    value: 'v.rcsValue',              description: 'RCS state' },
  { name: 'Light',             toggle: 'f.light',  value: 'v.lightValue',            description: 'Lights state' },
  { name: 'Gear',              toggle: 'f.gear',   value: 'v.gearValue',             description: 'Gear state' },
  { name: 'Brake',             toggle: 'f.brake',  value: 'v.brakeValue',            description: 'Brakes state' },
  { name: 'Abort',             toggle: 'f.abort',  value: 'v.abortValue',            description: 'Abort state' },
  { name: 'Precision Control', toggle: null,       value: 'v.precisionControlValue', description: 'Precision mode state' },
  { name: 'AG1',               toggle: 'f.ag1',    value: 'v.ag1Value',              description: 'Custom action group 1 state' },
  { name: 'AG2',               toggle: 'f.ag2',    value: 'v.ag2Value',              description: 'Custom action group 2 state' },
  { name: 'AG3',               toggle: 'f.ag3',    value: 'v.ag3Value',              description: 'Custom action group 3 state' },
  { name: 'AG4',               toggle: 'f.ag4',    value: 'v.ag4Value',              description: 'Custom action group 4 state' },
  { name: 'AG5',               toggle: 'f.ag5',    value: 'v.ag5Value',              description: 'Custom action group 5 state' },
  { name: 'AG6',               toggle: 'f.ag6',    value: 'v.ag6Value',              description: 'Custom action group 6 state' },
  { name: 'AG7',               toggle: 'f.ag7',    value: 'v.ag7Value',              description: 'Custom action group 7 state' },
  { name: 'AG8',               toggle: 'f.ag8',    value: 'v.ag8Value',              description: 'Custom action group 8 state' },
  { name: 'AG9',               toggle: 'f.ag9',    value: 'v.ag9Value',              description: 'Custom action group 9 state' },
  { name: 'AG10',              toggle: 'f.ag10',   value: 'v.ag10Value',             description: 'Custom action group 10 state' },
  { name: 'Stage',             toggle: 'f.stage',  value: 'v.currentStage',          description: 'Activate next stage' },
] as const satisfies ActionGroup[];

/** Union of every valid action group name, derived directly from the registry. */
export type ActionGroupId = typeof ACTION_GROUPS[number]['name'];
