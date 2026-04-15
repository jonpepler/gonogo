import type { ConfigField, DataSourceStatus } from "@gonogo/core";
import { getDataSource, registerComponent, useDataSources } from "@gonogo/core";
import { useState } from "react";
import styled, { keyframes } from "styled-components";

function DataSourceStatusComponent() {
  const sources = useDataSources();
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const openConfig = (id: string) => {
    const source = getDataSource(id);
    if (!source) return;
    const current = source.getConfig();
    setFormValues(
      Object.fromEntries(
        Object.entries(current).map(([k, v]) => [k, String(v)]),
      ),
    );
    setConfiguringId(id);
  };

  const saveConfig = (id: string, schema: ConfigField[]) => {
    const source = getDataSource(id);
    if (!source) return;
    const parsed: Record<string, unknown> = {};
    for (const field of schema) {
      parsed[field.key] =
        field.type === "number"
          ? Number(formValues[field.key])
          : formValues[field.key];
    }
    source.configure(parsed);
    setConfiguringId(null);
  };

  return (
    <Panel>
      <Title>Data Sources</Title>
      {sources.length === 0 ? (
        <Empty>No data sources registered</Empty>
      ) : (
        <List>
          {sources.map((source) => {
            const schema = getDataSource(source.id)?.configSchema() ?? [];
            const isConfiguring = configuringId === source.id;
            return (
              <Item key={source.id}>
                <Row>
                  <Indicator status={source.status} />
                  <Name>{source.name}</Name>
                  <StatusLabel status={source.status}>
                    {source.status}
                  </StatusLabel>
                  {source.status === "disconnected" && (
                    <RetryButton
                      onClick={() => {
                        void getDataSource(source.id)?.connect();
                      }}
                      aria-label={`Reconnect ${source.name}`}
                    >
                      Reconnect
                    </RetryButton>
                  )}
                  {schema.length > 0 && (
                    <ConfigButton
                      onClick={() =>
                        isConfiguring
                          ? setConfiguringId(null)
                          : openConfig(source.id)
                      }
                      aria-label={`Configure ${source.name}`}
                      $active={isConfiguring}
                    >
                      ⚙
                    </ConfigButton>
                  )}
                </Row>
                {source.status === "disconnected" &&
                  (() => {
                    const instructions = getDataSource(
                      source.id,
                    )?.setupInstructions?.();
                    return instructions ? (
                      <SetupInstructions>{instructions}</SetupInstructions>
                    ) : null;
                  })()}
                {isConfiguring && (
                  <ConfigForm>
                    {schema.map((field) => {
                      const inputId = `config-${source.id}-${field.key}`;
                      return (
                        <FieldRow key={field.key}>
                          <FieldLabel htmlFor={inputId}>
                            {field.label}
                          </FieldLabel>
                          <FieldInput
                            id={inputId}
                            type={field.type === "number" ? "number" : "text"}
                            placeholder={field.placeholder}
                            value={formValues[field.key] ?? ""}
                            onChange={(e) =>
                              setFormValues((prev) => ({
                                ...prev,
                                [field.key]: e.target.value,
                              }))
                            }
                          />
                        </FieldRow>
                      );
                    })}
                    <FormActions>
                      <SaveButton onClick={() => saveConfig(source.id, schema)}>
                        Save
                      </SaveButton>
                      <CancelButton onClick={() => setConfiguringId(null)}>
                        Cancel
                      </CancelButton>
                    </FormActions>
                  </ConfigForm>
                )}
              </Item>
            );
          })}
        </List>
      )}
    </Panel>
  );
}

registerComponent({
  id: "data-source-status",
  name: "Data Source Status",
  description:
    "Shows connection status for all registered data sources and lets you edit their configuration.",
  tags: ["system"],
  defaultSize: { w: 12, h: 1 },
  component: DataSourceStatusComponent,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: {},
});

export { DataSourceStatusComponent };

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
  overflow: auto;
`;

const Title = styled.h3`
  margin: 0 0 10px 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #666;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const Name = styled.span`
  flex: 1;
  font-size: 13px;
  color: #ccc;
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

const statusColor: Record<DataSourceStatus, string> = {
  connected: "#00ff88",
  disconnected: "#444",
  reconnecting: "#ff8c00",
  error: "#ff4444",
};

const Indicator = styled.span<{ status: DataSourceStatus }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ status }) => statusColor[status]};
  animation: ${({ status }) =>
    status === "connected" || status === "reconnecting" ? pulse : "none"}
    ${({ status }) => (status === "reconnecting" ? "1s" : "2s")} ease-in-out infinite;
`;

const StatusLabel = styled.span<{ status: DataSourceStatus }>`
  font-size: 11px;
  color: ${({ status }) => statusColor[status]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ConfigButton = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ $active }) => ($active ? "#aaa" : "#444")};
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.1s;
  &:hover { color: #aaa; }
`;

const ConfigForm = styled.div`
  background: #111;
  border: 1px solid #222;
  border-radius: 3px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const FieldRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const FieldLabel = styled.label`
  font-size: 11px;
  color: #666;
  width: 50px;
  flex-shrink: 0;
`;

const FieldInput = styled.input`
  background: #0d0d0d;
  border: 1px solid #333;
  border-radius: 3px;
  color: #ccc;
  font-family: monospace;
  font-size: 12px;
  padding: 3px 6px;
  width: 120px;
  &:focus {
    outline: none;
    border-color: #555;
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 2px;
`;

const SaveButton = styled.button`
  background: #1a2a1a;
  border: 1px solid #2a4a2a;
  border-radius: 3px;
  color: #00ff88;
  font-family: monospace;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  &:hover { background: #1f321f; }
`;

const CancelButton = styled.button`
  background: none;
  border: 1px solid #333;
  border-radius: 3px;
  color: #666;
  font-family: monospace;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  &:hover { color: #aaa; border-color: #555; }
`;

const SetupInstructions = styled.pre`
  margin: 0;
  padding: 8px 10px;
  background: #0a0a0a;
  border: 1px solid #222;
  border-radius: 3px;
  font-family: monospace;
  font-size: 11px;
  color: #555;
  white-space: pre-wrap;
  line-height: 1.5;
`;

const RetryButton = styled.button`
  background: none;
  border: 1px solid #333;
  border-radius: 3px;
  color: #666;
  font-family: monospace;
  font-size: 10px;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.1s, border-color 0.1s;
  &:hover { color: #aaa; border-color: #555; }
`;

const Empty = styled.p`
  margin: 0;
  font-size: 12px;
  color: #444;
`;
