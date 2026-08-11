# contribtype-a: passive, statically-typed component-led contribution slots

Research prototype for a `<widgetId>.<componentId>.<instanceName>` contribution
slot that a ui-kit component provisions for itself, and a facade-sealed
contributor targets with full type safety. Not production wiring; it exists to
prove the types hold.

```
./verify.sh
```

runs four checks: the tree typechecks, a contributor compiles with the widget
package absent from its program, the same tree with every `@ts-expect-error`
stripped fails with the expected diagnostics, and the runtime half registers
slots at module load.

## What each directory stands in for

| here | real tree |
| --- | --- |
| `src/kit/slots.ts` | `@ksp-gonogo/core` contributions + the type half that has to sit on the sdk leaf |
| `src/kit/Filter.tsx`, `src/kit/Meter.tsx` | `@ksp-gonogo/ui-kit` slot-aware components |
| `src/sdk/` | `@ksp-gonogo/sitrep-sdk`, the published facade |
| `src/widget/` | `packages/components`, a first-party widget |
| `src/uplink/` | an out-of-repo Uplink shipping its own widget |
| `src/contributor/`, `src/uplink-contributor/` | separate npm packages that only import the facade |

## The shape of it

Two declaration-merge seams and nothing else:

- `SlotKindEntries<Row>`, merged by a COMPONENT from its own file: "kind
  `filter` contributes `FilterEntry<Row>`". The type-level twin of `registerUnit`
- `WidgetSlotManifests`, merged by a WIDGET OWNER, one entry per widget, whose
  value is `typeof` the object the widget already renders from

Every slot id, entry type and topic union is computed off those two by mapped
and template-literal types. The widget keeps no list: the object it passes to
`defineSlots` IS its render surface, so a handle it does not declare cannot be
rendered and a handle it declares is a live, targetable, typed slot.

`local_docs/inbox/2026-08-11-from-contribtype-a-done.md` in the main repo is the
full write-up, including where this trades off and what it costs.
