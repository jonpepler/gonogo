import type {
  ActionGroupId,
  ComponentProps,
  ConfigComponentProps,
} from "@gonogo/core";
import {
  ACTION_GROUPS,
  registerComponent,
  useDataValue,
  useExecuteAction,
} from "@gonogo/core";
import { useRef, useState } from "react";
import styled from "styled-components";

type ActionGroupConfig = {
  actionGroupId: ActionGroupId;
  /** Custom display label. Falls back to the official action group name. */
  label?: string;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ActionGroupComponent({
  config,
  onConfigChange,
}: ComponentProps<ActionGroupConfig>) {
  const group = ACTION_GROUPS.find((g) => g.name === config?.actionGroupId);
  const currentLabel = config?.label ?? group?.name ?? "";

  const value = useDataValue("telemachus", group?.value ?? "v.sasValue");
  const execute = useExecuteAction("telemachus");

  // Inline label editing state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (!group) {
    return (
      <Panel>
        <Placeholder>No action group configured</Placeholder>
      </Panel>
    );
  }

  const isOn = value === true;
  const isUnknown = value === undefined;

  const handleToggle = () => {
    if (group.toggle) void execute(group.toggle);
  };

  const startEditing = () => {
    setDraft(currentLabel);
    setEditing(true);
    // Focus runs after render
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const commitEdit = () => {
    if (editing && onConfigChange) {
      onConfigChange({
        ...config,
        actionGroupId: group.name,
        label: draft || undefined,
      });
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") cancelEdit();
  };

  return (
    <Panel>
      <Header>
        <LabelArea
          onClick={!editing ? startEditing : undefined}
          title="Click to rename"
        >
          {editing ? (
            <LabelInput
              ref={inputRef}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <GroupLabel>{currentLabel}</GroupLabel>
          )}
          {/* Always show official name as secondary, unless it matches the label */}
          {config?.label && config.label !== group.name && (
            <OfficialName>{group.name}</OfficialName>
          )}
        </LabelArea>
        <StateIndicator $on={isOn} $unknown={isUnknown}>
          {isUnknown ? "—" : isOn ? "ON" : "OFF"}
        </StateIndicator>
      </Header>
      {group.toggle && (
        <ToggleButton
          onClick={handleToggle}
          aria-label={`Toggle ${currentLabel}`}
        >
          TOGGLE
        </ToggleButton>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Config component (rendered inside modal)
// ---------------------------------------------------------------------------

function ActionGroupConfigComponent({
  config,
  onSave,
}: ConfigComponentProps<ActionGroupConfig>) {
  const [actionGroupId, setActionGroupId] = useState<ActionGroupId>(
    config?.actionGroupId ?? "AG1",
  );
  const [label, setLabel] = useState(config?.label ?? "");

  const handleSave = () => {
    onSave({ actionGroupId, label: label.trim() || undefined });
  };

  return (
    <ConfigForm>
      <Field>
        <Label htmlFor="ag-select">Action Group</Label>
        <Select
          id="ag-select"
          value={actionGroupId}
          onChange={(e) => setActionGroupId(e.target.value as ActionGroupId)}
        >
          {ACTION_GROUPS.map((g) => (
            <option key={g.name} value={g.name}>
              {g.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label htmlFor="ag-label">Custom Label</Label>
        <Input
          id="ag-label"
          type="text"
          placeholder={actionGroupId}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <FieldHint>Leave blank to use the action group name.</FieldHint>
      </Field>
      <SaveButton onClick={handleSave}>Save</SaveButton>
    </ConfigForm>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerComponent<ActionGroupConfig>({
  id: "action-group",
  name: "Action Group",
  description:
    "Toggle a KSP action group or system (SAS, RCS, gear, brakes, lights, AG1–AG10).",
  tags: ["control", "telemetry"],
  defaultSize: { w: 2, h: 2 },
  component: ActionGroupComponent,
  configComponent: ActionGroupConfigComponent,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: { actionGroupId: "AG1" },
});

export { ActionGroupComponent };

// ---------------------------------------------------------------------------
// Styles — component
// ---------------------------------------------------------------------------

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
  gap: 5px;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
`;

const LabelArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
  cursor: text;
`;

const GroupLabel = styled.span`
  font-size: 13px;
  color: #ccc;
  font-weight: 600;
  letter-spacing: 0.05em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const OfficialName = styled.span`
  font-size: 10px;
  color: #444;
  letter-spacing: 0.04em;
`;

const LabelInput = styled.input`
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 2px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  padding: 1px 4px;
  width: 100%;
  box-sizing: border-box;
  outline: none;

  &:focus {
    border-color: #00ff88;
  }
`;

const StateIndicator = styled.span<{ $on: boolean; $unknown: boolean }>`
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  flex-shrink: 0;
  color: ${({ $on, $unknown }) =>
    $unknown ? "#444" : $on ? "#00ff88" : "#ff4444"};
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
  transition:
    border-color 0.1s,
    color 0.1s;

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

// ---------------------------------------------------------------------------
// Styles — config form
// ---------------------------------------------------------------------------

const ConfigForm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-family: monospace;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
`;

const Select = styled.select`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;

  &:focus {
    border-color: #555;
  }
`;

const Input = styled.input`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 13px;
  padding: 6px 8px;
  outline: none;

  &:focus {
    border-color: #555;
  }
`;

const FieldHint = styled.span`
  font-size: 10px;
  color: #444;
`;

const SaveButton = styled.button`
  align-self: flex-end;
  background: #1a3a1a;
  border: 1px solid #2a5a2a;
  border-radius: 3px;
  color: #00cc66;
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 6px 16px;
  cursor: pointer;
  text-transform: uppercase;

  &:hover {
    background: #1f4a1f;
    border-color: #3a7a3a;
  }
`;
