import type { ContactPhase } from "@ksp-gonogo/sitrep-client";
import type { Severity } from "@ksp-gonogo/ui-kit";
import type { DeadlineKind } from "./deadlines";

/**
 * The words this widget uses for a craft's contact state, deliberately the
 * ones FleetRoster and SystemView already use. Three surfaces inventing three
 * phrasings for the same wire state is how "overdue" quietly starts meaning
 * something different depending on where you read it.
 */
export const PHASE_LABEL: Record<ContactPhase, string> = {
  nominal: "In contact",
  waiting: "No contact",
  expected: "Reacquire expected",
  overdue: "Overdue",
  lost: "Officially lost",
};

/**
 * Severity is about the STATE, not about what to do next. `overdue` stops at
 * warning on purpose: the craft is late and there is still time for it, and
 * ranking it alongside a declared loss would make the call the operator is the
 * one entitled to make.
 */
export const PHASE_SEVERITY: Record<ContactPhase, Severity> = {
  nominal: "nominal",
  waiting: "info",
  expected: "info",
  overdue: "warning",
  lost: "critical",
};

/** The kind chip on each deadline row, so no row can be read as a restatement of another. */
export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  geometric: "Geometric",
  operational: "Operational",
  declaration: "Declaration",
};

/**
 * One hue per deadline kind, for the shared axis markers and each row's
 * gutter. These come off the CATEGORICAL ramp, never the status palette: hue
 * here answers "which of the three is this", and a status colour would answer
 * "how bad is it", a question the widget has no business answering. The ramp's
 * own contract is that a series colour must never be mistaken for a state
 * indicator, which is exactly the property wanted here.
 */
export const DEADLINE_KIND_COLOUR: Record<DeadlineKind, string> = {
  geometric: "var(--color-data-1)",
  operational: "var(--color-data-3)",
  declaration: "var(--color-data-5)",
};
