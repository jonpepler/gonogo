import styled from 'styled-components';
import { registerComponent, useDataValue, useExecuteAction, ACTION_GROUPS } from '@gonogo/core';
import type { ActionGroupId, ComponentProps } from '@gonogo/core';

type ActionGroupConfig = { actionGroupId: ActionGroupId };

function ActionGroupComponent({ config }: ComponentProps<ActionGroupConfig>) {
  const group = ACTION_GROUPS.find((g) => g.name === config?.actionGroupId);

  const value = useDataValue<boolean>('telemachus', group?.value ?? '');
  const execute = useExecuteAction('telemachus');

  if (!group) {
    return <Panel><Placeholder>No action group configured</Placeholder></Panel>;
  }

  const isOn = value === true;
  const isUnknown = value === undefined;

  const handleToggle = () => {
    if (group.toggle) void execute(group.toggle);
  };

  return (
    <Panel>
      <Header>
        <GroupName>{group.name}</GroupName>
        <StateIndicator $on={isOn} $unknown={isUnknown}>
          {isUnknown ? '—' : isOn ? 'ON' : 'OFF'}
        </StateIndicator>
      </Header>
      {group.toggle && (
        <ToggleButton onClick={handleToggle} aria-label={`Toggle ${group.name}`}>
          TOGGLE
        </ToggleButton>
      )}
    </Panel>
  );
}

registerComponent<ActionGroupConfig>({
  id: 'action-group',
  name: 'Action Group',
  category: 'controls',
  component: ActionGroupComponent,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: { actionGroupId: 'AG1' },
});

export { ActionGroupComponent };

// --- Styles ---

const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const GroupName = styled.span`
  font-size: 13px;
  color: #ccc;
  font-weight: 600;
  letter-spacing: 0.05em;
`;

const StateIndicator = styled.span<{ $on: boolean; $unknown: boolean }>`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: ${({ $on, $unknown }) => ($unknown ? '#444' : $on ? '#00ff88' : '#ff4444')};
`;

const ToggleButton = styled.button`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #aaa;
  font-family: monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  padding: 5px 10px;
  cursor: pointer;
  text-transform: uppercase;
  transition: border-color 0.1s, color 0.1s;

  &:hover {
    border-color: #555;
    color: #ddd;
  }

  &:active {
    background: #222;
  }
`;

const Placeholder = styled.span`
  font-size: 12px;
  color: #444;
`;
