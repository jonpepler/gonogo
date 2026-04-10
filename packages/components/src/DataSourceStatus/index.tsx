import styled, { keyframes } from 'styled-components';
import { registerComponent, useDataSources } from '@gonogo/core';
import type { DataSourceStatus } from '@gonogo/core';

function DataSourceStatusComponent() {
  const sources = useDataSources();

  return (
    <Panel>
      <Title>Data Sources</Title>
      {sources.length === 0 ? (
        <Empty>No data sources registered</Empty>
      ) : (
        <List>
          {sources.map((source) => (
            <Row key={source.id}>
              <Indicator status={source.status} />
              <Name>{source.name}</Name>
              <StatusLabel status={source.status}>{source.status}</StatusLabel>
            </Row>
          ))}
        </List>
      )}
    </Panel>
  );
}

registerComponent({
  id: 'data-source-status',
  name: 'Data Source Status',
  category: 'system',
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
  min-width: 220px;
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

const Row = styled.li`
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
  connected: '#00ff88',
  disconnected: '#444',
  error: '#ff4444',
};

const Indicator = styled.span<{ status: DataSourceStatus }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ status }) => statusColor[status]};
  animation: ${({ status }) => (status === 'connected' ? pulse : 'none')} 2s ease-in-out infinite;
`;

const StatusLabel = styled.span<{ status: DataSourceStatus }>`
  font-size: 11px;
  color: ${({ status }) => statusColor[status]};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const Empty = styled.p`
  margin: 0;
  font-size: 12px;
  color: #444;
`;
