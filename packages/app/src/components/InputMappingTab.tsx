import type { ActionDefinition } from "@gonogo/core";
import { FieldHint, FieldLabel, GhostButton, PrimaryButton } from "@gonogo/ui";
import { useMemo } from "react";
import styled from "styled-components";

export interface InputBinding {
  deviceId: string;
  inputId: string;
}

export type InputMappings = Record<string, InputBinding | null>;

interface InputMappingTabProps {
  actions: readonly ActionDefinition[];
  mappings: InputMappings;
  onSave: (next: InputMappings) => void;
  onClose?: () => void;
}

/**
 * Phase 3 stub — renders the action list for the component so users can
 * see what can be mapped. Phase 4 wires in the actual device-input dropdowns
 * and the `onSave` flow.
 */
export function InputMappingTab({
  actions,
  mappings,
  onSave,
  onClose,
}: Readonly<InputMappingTabProps>) {
  const rows = useMemo(() => actions, [actions]);

  if (rows.length === 0) {
    return (
      <Empty>
        This component does not expose any actions, so there is nothing to bind.
      </Empty>
    );
  }

  return (
    <Wrap>
      <FieldHint>
        Device binding UI lands in Phase 4. For now this tab lists the actions
        the component exposes.
      </FieldHint>
      <List>
        {rows.map((action) => (
          <Row key={action.id}>
            <RowHeader>
              <FieldLabel>{action.label}</FieldLabel>
              <Accepts>{action.accepts.join(" · ")}</Accepts>
            </RowHeader>
            {action.description && <FieldHint>{action.description}</FieldHint>}
            <Binding>
              {mappings[action.id]
                ? `${mappings[action.id]?.deviceId} · ${mappings[action.id]?.inputId}`
                : "unbound"}
            </Binding>
          </Row>
        ))}
      </List>
      <Actions>
        {onClose && <GhostButton onClick={onClose}>Cancel</GhostButton>}
        <PrimaryButton onClick={() => onSave(mappings)}>Save</PrimaryButton>
      </Actions>
    </Wrap>
  );
}

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Empty = styled.div`
  color: #666;
  font-size: 12px;
  padding: 8px 0;
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Row = styled.div`
  background: #161616;
  border: 1px solid #222;
  border-radius: 4px;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const RowHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
`;

const Accepts = styled.span`
  font-size: 10px;
  color: #555;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const Binding = styled.span`
  font-family: monospace;
  font-size: 11px;
  color: #888;
`;

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
`;
