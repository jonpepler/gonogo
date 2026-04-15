import type { ConfigField, DataSourceStatus } from "@gonogo/core";
import { getDataSource, registerComponent, useDataSources } from "@gonogo/core";
import {
  FieldLabel,
  FieldRow,
  FormActions,
  GhostButton,
  IconButton,
  Input,
  PanelScrollable,
  PanelTitle,
  Placeholder,
  PrimaryButton,
} from "@gonogo/ui";
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
    <PanelScrollable>
      <PanelTitle>Data Sources</PanelTitle>
      {sources.length === 0 ? (
        <Placeholder>No data sources registered</Placeholder>
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
                          <Input
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
                      <PrimaryButton
                        onClick={() => saveConfig(source.id, schema)}
                      >
                        Save
                      </PrimaryButton>
                      <GhostButton onClick={() => setConfiguringId(null)}>
                        Cancel
                      </GhostButton>
                    </FormActions>
                  </ConfigForm>
                )}
              </Item>
            );
          })}
        </List>
      )}
    </PanelScrollable>
  );
}

registerComponent({
  id: "data-source-status",
  name: "Data Source Status",
  description:
    "Shows connection status for all registered data sources and lets you edit their configuration.",
  tags: ["system"],
  defaultSize: { w: 12, h: 10 },
  component: DataSourceStatusComponent,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: {},
});

export { DataSourceStatusComponent };

// --- Styles ---

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
    ${({ status }) => (status === "reconnecting" ? "1s" : "2s")} ease-in-out
    infinite;
`;

const StatusLabel = styled.span<{ status: DataSourceStatus }>`
  font-size: 11px;
  color: ${({ status }) => statusColor[status]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ConfigButton = styled(IconButton)<{ $active: boolean }>`
  color: ${({ $active }) => ($active ? "#aaa" : "#444")};
  font-size: 13px;
  padding: 0 2px;
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

const RetryButton = styled(GhostButton)`
  font-size: 10px;
  letter-spacing: 0.05em;
  white-space: nowrap;
  padding: 2px 6px;
`;
