# Component-led contribution slots: a typing research prototype

Not production code and not wired into the app. It exists to answer one question
with a compiler rather than an argument: can a ui-kit component self-register its
own contribution slot so that a facade-sealed contributor targets it with full
static type safety, while the widget hand-maintains nothing?

Run all three gates:

```sh
node_modules/.bin/tsc -p research/contribtype-b/tsconfig.host.json         # host + ui-kit + sdk
node_modules/.bin/tsc -p research/contribtype-b/tsconfig.contributor.json  # facade-sealed contributor
cd research/contribtype-b && ../../node_modules/.bin/vitest run --config vitest.config.ts
```

All three must be clean. The contributor program is where the proof lives: every
`@ts-expect-error` in `src/contributor/negatives.ts` is an assertion that a
mistake DOES fail to compile, so a clean run means the guarantees hold in both
directions.

## What is where

| Path | What it shows |
| --- | --- |
| `spike/jsx-erases-the-brand.tsx` | The negative result the whole design follows from: a JSX element expression is `JSX.Element`, so a component's return type (and any brand on it) never reaches the enclosing widget's type |
| `src/sdk/types.ts` | The type core: three registries, the key algebra, `slot` / `componentSlot` / `inWidget` |
| `src/sdk/widgets.ts` | Variant A's mirror: one line per widget |
| `src/sdk/subjects.ts` | Variant B's mirror: one line per subject |
| `src/sdk/__generated__/slot-manifest.ts` | Variant A's optional seal, generated from a render |
| `src/sdk/emitSlotManifest.ts` | The whole of the codegen: it parses nothing |
| `src/sdk/slot-instances.ts` | The runtime registry a component announces itself into |
| `src/ui-kit/Filter.tsx` | Variant A slot component: id from context + self + prop |
| `src/ui-kit/SubjectFilter.tsx` | Variant B slot component: id from self + a checked subject token |
| `src/host/*` | Widgets that declare nothing about their slots beyond the JSX |
| `src/host/why-the-manifest-cannot-live-here.ts` | Why a declaration in an app-side package is invisible to a contributor |
| `src/contributor/*` | The facade-sealed side, positives and negatives, both variants |
| `demo/bridge.test.tsx` | The runtime half end to end, including the manifest gate |

## The two variants

**A. `widget.component.instance`** (`resource-ops.filter.process`). Per-widget
scoping. The instance name cannot be statically checked without generating a
manifest from a render, because the type system cannot see JSX.

**B. `component.subject`** (`subject-filter.isru-unit`), optionally narrowed with
`@widget`. Every segment is checked against a declared registry, so there is no
manifest, no codegen and no free string anywhere.

The full write-up, including the honest cost of each, is in
`local_docs/inbox/2026-08-11-from-contribtype-b-done.md` (gitignored).
