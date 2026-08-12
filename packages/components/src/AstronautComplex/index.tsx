import type { ComponentProps } from "@ksp-gonogo/core";
import { registerComponent, useTelemetry } from "@ksp-gonogo/core";
import { META_VANTAGE, useCommand } from "@ksp-gonogo/sitrep-client";
import { value } from "@ksp-gonogo/sitrep-sdk";
import {
  ActionButton,
  NULL_DISPLAY,
  Panel,
  ScrollArea,
  speakQuantity,
  Unit,
  usePanelDelay,
} from "@ksp-gonogo/ui-kit";
import { useEffect, useState } from "react";
import styled from "styled-components";
import { type KerbalStatFields, KerbalStats } from "../shared/KerbalStats";
import { magnitudeOf, type Quantityish } from "../shared/magnitude";

type AstronautComplexConfig = Record<string, never>;

/**
 * A crew cap at or above this reads as "no cap" and the widget shows the head
 * count alone rather than "N / cap". KSP's top Astronaut Complex tier returns
 * <c>int.MaxValue</c> from <c>GetActiveCrewLimit</c> (an unlimited roster), and
 * a literal "6 / 2147483647" is noise, not information. Anything a real save
 * reaches (tier 1 caps at 5, tier 2 at 13) sits far below this.
 */
const UNLIMITED_CREW_CAP = 1_000_000;

const ARM_TIMEOUT_MS = 4000;

interface Applicant {
  name: string;
  trait: string;
  level: number;
  hireCost: number | null;
}

/** An applicant carries only name / trait / level. The remaining astronaut
 *  stats the shared row can show (veteran, badass, career flights, current
 *  assignment) do not apply to someone not yet on the books, so they take
 *  their safe zero and those badges never render. */
function applicantStats(a: Applicant): KerbalStatFields {
  return {
    name: a.name,
    trait: a.trait,
    experienceLevel: a.level,
    veteran: false,
    isBadass: false,
    careerFlights: 0,
    available: true,
    unavailableReason: "",
    currentVesselName: "",
  };
}

function AstronautComplexComponent(
  _props: Readonly<ComponentProps<AstronautComplexConfig>>,
) {
  // The applicant pool, roster cap and active-crew count ride the
  // spaceCenter.astronautComplex Topic; funds comes off
  // career.status.economy.funds (the same read SpaceCenterStatus uses). Both
  // degrade to null outside career, so the widget shows an empty state rather
  // than erroring.
  const complex = useTelemetry("spaceCenter.astronautComplex");
  const careerFunds = magnitudeOf(
    useTelemetry("career.status")?.economy?.funds,
  );

  // Hiring is a KSC ground action (no vessel signal delay), so it dispatches at
  // the meta-vantage (instant). usePanelDelay contributes the handle to the
  // panel's delay rail (a no-op here, but the must-consume invariant requires it).
  const hireCmd = useCommand("career.crew.hire", { vantage: META_VANTAGE });
  usePanelDelay(hireCmd);

  const applicants = readApplicants(complex?.applicants);
  const activeCrew = magnitudeOf(complex?.activeCrew);
  const crewCapacity = magnitudeOf(complex?.crewCapacity);

  const hasCap =
    crewCapacity !== null &&
    crewCapacity > 0 &&
    crewCapacity < UNLIMITED_CREW_CAP;
  const rosterFull =
    hasCap &&
    activeCrew !== null &&
    crewCapacity !== null &&
    activeCrew >= crewCapacity;

  // Off career (or before telemetry warms up): no applicant pool at all. Show a
  // graceful empty state, still surfacing funds when they are known.
  if (complex === undefined) {
    return (
      <Panel panelTitle="ASTRONAUT COMPLEX">
        <Body>
          <FundsLine role="status">
            <FundsLabel>Funds</FundsLabel>
            {careerFunds !== null ? (
              <FundsValue title="Available funds">
                <Unit value={value("funds", careerFunds)} />
              </FundsValue>
            ) : (
              <FundsValue>{NULL_DISPLAY}</FundsValue>
            )}
          </FundsLine>
          <Empty>No applicant data (career mode only)</Empty>
        </Body>
      </Panel>
    );
  }

  const capLine = hasCap
    ? `Crew ${activeCrew ?? NULL_DISPLAY} / ${crewCapacity}`
    : activeCrew !== null
      ? `Crew ${activeCrew}`
      : "";

  return (
    <Panel panelTitle="ASTRONAUT COMPLEX">
      <Body>
        <Header role="status" aria-live="polite">
          <FundsLine>
            <FundsLabel>Funds</FundsLabel>
            {careerFunds !== null ? (
              <FundsValue
                title={speakQuantity(value("funds", careerFunds), {
                  decimals: 0,
                })}
              >
                <Unit value={value("funds", careerFunds)} />
              </FundsValue>
            ) : (
              <FundsValue>{NULL_DISPLAY}</FundsValue>
            )}
          </FundsLine>
          {capLine && (
            <CapLine $full={rosterFull}>
              {capLine}
              {rosterFull && <FullBadge>FULL</FullBadge>}
            </CapLine>
          )}
        </Header>

        <Group aria-label="Applicants">
          <GroupHeading>
            Applicants
            <GroupCount>{applicants.length}</GroupCount>
          </GroupHeading>
          {applicants.length === 0 ? (
            <Empty>No applicants right now</Empty>
          ) : (
            <List>
              {applicants.map((a) => {
                const affordable =
                  a.hireCost !== null &&
                  (careerFunds === null || careerFunds >= a.hireCost);
                const canHire = affordable && !rosterFull;
                return (
                  // Kerbal names are unique within the applicant pool, so the
                  // name is a stable key (no array index).
                  <Applicant__Row key={a.name}>
                    <Who>
                      <KerbalStats kerbal={applicantStats(a)} />
                    </Who>
                    <Cost $afford={affordable}>
                      {a.hireCost !== null ? (
                        <Unit value={value("funds", a.hireCost)} />
                      ) : (
                        NULL_DISPLAY
                      )}
                    </Cost>
                    <HireButton
                      applicantName={a.name}
                      hireCost={a.hireCost}
                      enabled={canHire}
                      disabledReason={
                        rosterFull
                          ? "Roster full"
                          : !affordable
                            ? "Insufficient funds"
                            : undefined
                      }
                      onConfirm={() =>
                        void hireCmd.send({ applicantName: a.name })
                      }
                    />
                  </Applicant__Row>
                );
              })}
            </List>
          )}
        </Group>
      </Body>
    </Panel>
  );
}

/**
 * Arm-then-confirm hire button (a funds SPEND, so it never fires on a single
 * click): first click arms a go-toned "Confirm" that auto-disarms after
 * {@link ARM_TIMEOUT_MS}. Reuses the ui-kit {@link ActionButton} primitive
 * (`ghost` -> `go`), the same spend-confirm pattern SpaceCenterStatus uses for
 * facility upgrades.
 */
function HireButton({
  applicantName,
  hireCost,
  enabled,
  disabledReason,
  onConfirm,
}: {
  applicantName: string;
  hireCost: number | null;
  enabled: boolean;
  disabledReason?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), ARM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [armed]);

  const costText =
    hireCost !== null ? ` for ${Math.round(hireCost)} funds` : "";

  if (!enabled) {
    return (
      <ActionButton
        type="button"
        disabled
        title={disabledReason}
        aria-label={`Hire ${applicantName || "applicant"}${costText} (${disabledReason ?? "unavailable"})`}
      >
        Hire
      </ActionButton>
    );
  }
  if (!armed) {
    return (
      <ActionButton
        type="button"
        onClick={() => setArmed(true)}
        aria-label={`Hire ${applicantName || "applicant"}${costText}`}
      >
        Hire
      </ActionButton>
    );
  }
  return (
    <ActionButton
      type="button"
      tone="go"
      onClick={() => {
        setArmed(false);
        onConfirm();
      }}
      aria-label={`Confirm hire of ${applicantName || "applicant"}${costText}`}
    >
      Confirm
    </ActionButton>
  );
}

function readApplicants(raw: unknown): Applicant[] {
  if (!Array.isArray(raw)) return [];
  const out: Applicant[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    out.push({
      name: typeof e.name === "string" ? e.name : "",
      trait: typeof e.trait === "string" ? e.trait : "",
      level: magnitudeOf(e.level as Quantityish) ?? 0,
      hireCost: magnitudeOf(e.hireCost as Quantityish),
    });
  }
  return out;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const Body = styled(ScrollArea)`
  flex: 1;
  min-height: 0;

  [data-scroll-area-inner] {
    display: flex;
    flex-direction: column;
    gap: var(--space-10);
  }
`;

const Header = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-8);
  flex-wrap: wrap;
`;

const FundsLine = styled.div`
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-6);
`;

const FundsLabel = styled.span`
  font-size: var(--font-size-2xs);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-faint);
`;

const FundsValue = styled.span`
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--color-status-go-fg);
  font-variant-numeric: tabular-nums;
`;

const CapLine = styled.span<{ $full: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  color: ${(p) =>
    p.$full ? "var(--color-status-nogo-bg)" : "var(--color-text-muted)"};
`;

const FullBadge = styled.span`
  font-size: var(--font-size-2xs);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--color-status-nogo-bg);
`;

const Group = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const GroupHeading = styled.h3`
  display: flex;
  align-items: center;
  gap: var(--space-6);
  margin: 0;
  font-size: var(--font-size-2xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-faint);
`;

const GroupCount = styled.span`
  font-size: var(--font-size-2xs);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
`;

const Applicant__Row = styled.li`
  display: flex;
  align-items: center;
  gap: var(--space-8);
  padding: var(--space-4) var(--space-8);
  background: var(--color-surface-panel);
  border-radius: var(--radius-xs);
`;

const Who = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: var(--space-2);
`;

const Cost = styled.span<{ $afford: boolean }>`
  font-size: var(--font-size-2xs);
  font-variant-numeric: tabular-nums;
  color: ${(p) =>
    p.$afford ? "var(--color-accent-fg)" : "var(--color-status-nogo-bg)"};
  font-weight: ${(p) => (p.$afford ? "inherit" : "600")};
`;

const Empty = styled.div`
  font-size: var(--font-size-xs);
  color: var(--color-text-faint);
  padding: var(--space-6) 0;
`;

// ── Registration ──────────────────────────────────────────────────────────────

registerComponent<AstronautComplexConfig>({
  id: "astronaut-complex",
  name: "Astronaut Complex",
  description:
    "Astronaut Complex applicant pool: each candidate shown with the same astronaut stats as the crew roster (trait and experience), the current funds balance and the roster cap, and a per-row arm-then-confirm Hire action that is disabled when funds are short or the roster is at the facility cap.",
  tags: ["career", "crew", "kc"],
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  component: AstronautComplexComponent,
  dataRequirements: ["spaceCenter.astronautComplex", "career.funds"],
  defaultConfig: {},
  actions: [],
  pushable: true,
});

export { AstronautComplexComponent };
