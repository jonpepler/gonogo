// ---------------------------------------------------------------------------
// THE NEGATIVE RESULT, and the reason this design looks the way it does.
//
// The tempting pattern is to brand a slot component's return type with its
// `name` prop and read the brand back out of the enclosing widget's inferred
// return type. If that worked, `<Filter name="process" />` would BE the static
// declaration and both goals would fall out for free.
//
// It cannot work. The type of a JSX element EXPRESSION is `JSX.Element`,
// unconditionally, whatever the component's declared return type is. TS checks
// the return type against `JSX.ElementType` and then throws it away. The three
// assertions below pin that down: the brand survives a longhand type and a
// direct function call, and is gone the instant JSX is involved.
//
// Everything that follows from this: no amount of const type parameters, mapped
// types or `satisfies` recovers information from a render tree, because the
// information never enters the type system in the first place. A passive link
// therefore has to be forged by something that reads the tree: the runtime
// (which is too late for types) or a build step (codegen). That is a property of
// JSX, not of the design.
// ---------------------------------------------------------------------------

import type { ReactElement } from "react";

type Mark<C extends string, N extends string> = {
  readonly __slot?: readonly [C, N];
};

type MarksOf<T> = T extends { readonly __slot?: readonly [infer C, infer N] }
  ? `${C & string}.${N & string}`
  : never;

declare function Filter<const N extends string>(props: {
  name: N;
}): ReactElement & Mark<"filter", N>;

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Expect<T extends true> = T;

// (a) the brand is readable when the type is written out longhand
export type _Longhand = Expect<
  Eq<MarksOf<ReactElement & Mark<"filter", "process">>, "filter.process">
>;

// (b) ... and when the component is CALLED as a plain function
const called = Filter({ name: "process" });
export type _Called = Expect<Eq<MarksOf<typeof called>, "filter.process">>;

// (c) ... and is GONE through JSX. This is the blocker, stated as a test so it
//     stays true rather than remembered: if a future TS release starts
//     propagating the return type, this assertion is what fails and tells us the
//     passive-typing route reopened.
const rendered = <Filter name="process" />;
export type _JsxErasesIt = Expect<Eq<MarksOf<typeof rendered>, never>>;
export type _JsxIsJustElement = Expect<Eq<typeof rendered, JSX.Element>>;
