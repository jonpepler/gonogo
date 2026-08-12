import { Badge, NULL_DISPLAY } from "@ksp-gonogo/ui-kit";
import type { ReactNode } from "react";
import styled from "styled-components";

// ---------------------------------------------------------------------------
// Shared kerbal stat block: name + trait/level/trait-badge row.
//
// One renderer for a single kerbal's astronaut stats, used by both the Staff
// Roster (existing crew) and the Astronaut Complex (applicant pool) so a
// candidate reads at the same fidelity as a hired crew member. Renders the
// Name plus a Meta row carrying trait, experience level, and the veteran /
// badass / career-flight / unavailable badges. Callers own the surrounding
// card and any trailing chrome (a hire button, an augment slot), which they
// pass as `children` to append inside the Meta row.
// ---------------------------------------------------------------------------

/** The stat fields a kerbal row renders. A superset of what a fresh applicant
 *  carries: applicants set the veteran / badass / flight / availability fields
 *  to their safe zero (a new recruit has no flights and is always available to
 *  hire), so those badges simply do not appear. */
export interface KerbalStatFields {
  name: string;
  trait: string;
  experienceLevel: number;
  veteran: boolean;
  isBadass: boolean;
  careerFlights: number;
  available: boolean;
  unavailableReason: string;
  currentVesselName: string;
}

export function KerbalStats({
  kerbal,
  children,
}: {
  kerbal: KerbalStatFields;
  /** Appended at the end of the Meta row (e.g. an augment slot). */
  children?: ReactNode;
}) {
  return (
    <>
      <KerbalStats__Name>{kerbal.name || NULL_DISPLAY}</KerbalStats__Name>
      <KerbalStats__Meta>
        <TraitTag title={`Trait: ${kerbal.trait || "Unknown"}`}>
          {kerbal.trait || NULL_DISPLAY}
        </TraitTag>
        <Level
          title={`Experience level ${kerbal.experienceLevel}`}
          aria-label={`Experience level ${kerbal.experienceLevel}`}
        >
          L{kerbal.experienceLevel}
        </Level>
        {kerbal.veteran && (
          <Badge
            severity="nominal"
            size="sm"
            aria-label="veteran"
            title="Veteran: has flown a notable mission"
          >
            ★
          </Badge>
        )}
        {kerbal.isBadass && (
          <Badge
            severity="warning"
            size="sm"
            aria-label="badass"
            title="Badass: KSP's brave trait; rarely panics"
          >
            BA
          </Badge>
        )}
        {kerbal.careerFlights > 0 && (
          <Badge
            size="sm"
            aria-label={`${kerbal.careerFlights} flights`}
            title={`${kerbal.careerFlights} career flight${kerbal.careerFlights === 1 ? "" : "s"} completed`}
          >
            {kerbal.careerFlights}F
          </Badge>
        )}
        {!kerbal.available && (
          <Badge
            severity="critical"
            size="sm"
            title={
              kerbal.currentVesselName
                ? `${kerbal.unavailableReason || "Unavailable"} (${kerbal.currentVesselName})`
                : kerbal.unavailableReason || "Unavailable"
            }
          >
            {kerbal.unavailableReason || "Unavailable"}
          </Badge>
        )}
        {children}
      </KerbalStats__Meta>
    </>
  );
}

const KerbalStats__Name = styled.span`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const KerbalStats__Meta = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: center;
`;

const TraitTag = styled.span`
  font-size: var(--font-size-2xs);
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  text-transform: uppercase;
`;

const Level = styled.span`
  font-size: var(--font-size-2xs);
  color: var(--color-accent-fg);
  font-variant-numeric: tabular-nums;
`;
