import { formatDuration } from "@gonogo/core";
import type { ParsedManeuverNode } from "@gonogo/data";
import styled from "styled-components";
import { FeasibilityChip } from "./styles";

interface NodeRowProps {
  node: ParsedManeuverNode;
  currentUT: number | undefined;
  availableDv: number;
  onDelete: () => void;
}

export function NodeRow({
  node,
  currentUT,
  availableDv,
  onDelete,
}: NodeRowProps) {
  const timeTo = currentUT !== undefined ? node.UT - currentUT : null;
  const feasible =
    availableDv === 0 ? null : availableDv >= node.deltaVMagnitude;
  return (
    <NodeLi>
      <NodeMain>
        <NodePrimary>
          {node.deltaVMagnitude.toFixed(0)} m/s
          {feasible === false && (
            <FeasibilityChip $ok={false}>SHORT</FeasibilityChip>
          )}
        </NodePrimary>
        <NodeMeta>
          burn in {timeTo === null ? "—" : formatDuration(timeTo)}
        </NodeMeta>
      </NodeMain>
      <DeleteButton type="button" onClick={onDelete} aria-label="Delete node">
        ✕
      </DeleteButton>
    </NodeLi>
  );
}

const NodeLi = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  background: #141414;
  border: 1px solid #222;
  border-radius: 2px;
`;

const NodeMain = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
`;

const NodePrimary = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #ccc;
`;

const NodeMeta = styled.div`
  font-size: 10px;
  color: #666;
  letter-spacing: 0.04em;
`;

const DeleteButton = styled.button`
  background: transparent;
  border: 1px solid #3a2222;
  color: #a66;
  font-family: monospace;
  font-size: 11px;
  width: 22px;
  height: 22px;
  border-radius: 2px;
  cursor: pointer;
  &:hover {
    background: #2a1111;
    color: #f88;
  }
`;
