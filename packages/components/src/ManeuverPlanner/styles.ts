import styled from "styled-components";

/**
 * Styled bits shared between ManeuverPlanner/index.tsx and its sub-component
 * files (NodeRow, PresetPicker, LabeledInput). Single-use styles live
 * alongside their component.
 */

export const FeasibilityChip = styled.span<{ $ok: boolean }>`
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: ${({ $ok }) => ($ok ? "#1f3a1f" : "#3a1a1a")};
  border: 1px solid ${({ $ok }) => ($ok ? "#2e5a2e" : "#5a2a2a")};
  color: ${({ $ok }) => ($ok ? "#cfe" : "#fbb")};
  letter-spacing: 0.08em;
`;
