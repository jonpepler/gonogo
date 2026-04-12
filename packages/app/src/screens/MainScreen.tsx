import { useEffect } from 'react';
import styled from 'styled-components';
import { getDataSources } from '@gonogo/core';
import { DataSourceStatusComponent, ActionGroupComponent } from '@gonogo/components';

export function MainScreen() {
  useEffect(() => {
    const sources = getDataSources();
    sources.forEach((s) => { void s.connect(); });
    return () => { sources.forEach((s) => s.disconnect()); };
  }, []);

  return (
    <Layout>
      <DataSourceStatusComponent />
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

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;
