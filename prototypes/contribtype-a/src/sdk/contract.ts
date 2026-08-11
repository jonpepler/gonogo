// Generated contract types the sdk already owns. Stand-in for
// `mod/sitrep-sdk/src/__generated__/contract.ts`.

export interface IsruDrillEntry {
  partId: string;
  resource: string;
  rate: number;
}

export interface IsruConverterEntry {
  partId: string;
  recipe: string;
  running: boolean;
}

/**
 * ResourceOps' row type. Already mirrored on the sdk today
 * (`api/contribution-slots.ts`), and built out of generated contract types, so
 * no new hand-kept surface is introduced by this pattern.
 */
export type ResourceOpsUnit =
  | { kind: "drill"; drill: IsruDrillEntry }
  | { kind: "converter"; converter: IsruConverterEntry };
