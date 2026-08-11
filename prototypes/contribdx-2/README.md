# contribdx-2: component-led contribution slots, two-segment, zero widget lines

Design prototype for the component-led extension layer: a reusable component
declares its slot KIND once, passively, and every widget that mounts it gets a
live slot addressed `<widgetId>.<slotKind>` (the shipping `ship-map.part-meters`
grammar) with no per-widget re-declaration. Publication for facade-sealed
contributors is one `SlotOf` line per slot on the sdk mirror, building on
contribtype-a's finding that the sdk-leaf line is necessary and sufficient.

```
./verify.sh
```

runs four checks: the tree typechecks, the contributor compiles with only
`src/sdk` + `src/contributor` in its program, the suppression-stripped tree
fails with the expected diagnostics, and six runtime tests prove that mounting
the component is what creates the slot.

## What each file stands for

| here | real tree |
| --- | --- |
| `src/sdk/types.ts` | `mod/sitrep-sdk/src/api/types.ts` (+ the contribution runtime, hosted here only so the sealed program has a callable) |
| `src/sdk/contribution-slots.ts` | `mod/sitrep-sdk/src/api/contribution-slots.ts`, the one-line-per-slot mirror, now written with `SlotOf` |
| `src/core/contributions.ts` | `packages/core/src/contributions.ts`, with the ONE structural change: core's registry extends the sdk's |
| `src/core/componentSlots.ts` | NEW `packages/core/src/componentSlots.ts`: `registerSlotKind` + the per-widget mounted-slot store |
| `src/core/contributionsRuntime.tsx` | `packages/core/src/contributionsRuntime.tsx`: provider aggregates declared ∪ announced slots; NEW `useComponentSlot` |
| `src/core/contributedFilters.ts` | `packages/core/src/contributedFilters.ts`: gains the zero-arg component-led overloads |
| `src/core/WidgetHost.tsx` | the orchestrator's GridItemContent, unchanged |
| `src/kit/FilterBarLite.tsx` | ui-kit's `FilterBar`, unchanged |
| `src/widget/ResourceOps.tsx` | the widget, now writing ZERO slot lines |
| `src/widget/IsruConsole.tsx` | multi-mount: two bars under qualified keys (`as: "process-filters"`) |
| `src/widget/ShipMapLite.tsx` | the widget-led layer 1, coexisting unchanged |
| `src/contributor/*` | a facade-sealed contributor, positives and pinned violations |
| `src/type-assertions.ts` | the extends mechanism, asserted at the type level |

The full design write-up is the fleet report
(`local_docs/inbox/2026-08-11-from-contribdx-2-done.md`, gitignored, main repo).
