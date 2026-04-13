import { useEffect } from 'react';
import styled from 'styled-components';
import { getDataSources } from '@gonogo/core';
import { DataSourceStatusComponent, ActionGroupComponent, KosTerminalComponent } from '@gonogo/components';

export function MainScreen() {
  useEffect(() => {
    const sources = getDataSources();
    sources.forEach((s) => { void s.connect(); });
    return () => { sources.forEach((s) => s.disconnect()); };
  }, []);

  return (
    <Layout>
      <DataSourceStatusComponent />
      <TerminalRow>
        <TerminalLabel>Interactive</TerminalLabel>
        <Terminal>
          <KosTerminalComponent />
        </Terminal>
        <TerminalLabel>Read-only (system CPU)</TerminalLabel>
        <Terminal>
          <KosTerminalComponent config={{ readOnly: true, cpuName: 'system' }} />
        </Terminal>
      </TerminalRow>
      <Row>
        <ActionGroupComponent config={{ actionGroupId: 'SAS' }} />
        <ActionGroupComponent config={{ actionGroupId: 'RCS' }} />
        <ActionGroupComponent config={{ actionGroupId: 'Gear' }} />
        <ActionGroupComponent config={{ actionGroupId: 'Brake' }} />
        <ActionGroupComponent config={{ actionGroupId: 'Light' }} />
        <ActionGroupComponent config={{ actionGroupId: 'AG1' }} />
      </Row>
    </Layout>
  );
}

const Layout = styled.div`
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #050505;
  min-height: 100vh;
`;

const TerminalRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TerminalLabel = styled.span`
  font-family: monospace;
  font-size: 11px;
  color: #555;
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const Terminal = styled.div`
  height: 300px;
`;

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;
