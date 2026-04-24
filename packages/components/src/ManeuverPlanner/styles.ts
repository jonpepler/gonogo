import styled from "styled-components";

/**
 * Styled bits shared between ManeuverPlanner/index.tsx and its sub-component
 * files (NodeRow, PresetPicker, LabeledInput). Single-use styles live
 * alongside their component.
 */

export const FeasibilityChip = styled.span<{ $ok: boolean }>`
  font-size: 10px;
  font-weight: ${({ $ok }) => ($ok ? 400 : 700)};
  padding: 1px 6px;
  border-radius: 10px;
  /* Failing state shifted brighter — the quiet maroon on dark background
     was sliding past readers. WCAG 1.4.11 non-text contrast met at 3:1. */
  background: ${({ $ok }) => ($ok ? "#1f3a1f" : "#5a1414")};
  border: 1px solid ${({ $ok }) => ($ok ? "#2e5a2e" : "#ff4d4d")};
  color: ${({ $ok }) => ($ok ? "#cfe" : "#ffdede")};
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

/**
 * Full-width shortfall banner shown when the planned burn exceeds the
 * available ΔV. Rendered with role="alert" so screen readers announce it
 * on the transition from feasible → infeasible.
 */
export const FeasibilityBanner = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  background: #3a0a0a;
  border: 1px solid #ff4d4d;
  border-radius: 2px;
  color: #ffdede;
  font-family: monospace;
`;

export const FeasibilityBannerTitle = styled.span`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

export const FeasibilityBannerBody = styled.span`
  font-size: 11px;
  color: #ffb8b8;
`;
