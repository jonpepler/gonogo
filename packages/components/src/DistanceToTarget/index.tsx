import styled from 'styled-components';
import { registerComponent, useDataValue, getBody } from '@gonogo/core';
import { formatDistance } from '@gonogo/core';
import type { ComponentProps } from '@gonogo/core';

interface DistanceToTargetConfig {
  /**
   * The body ID to track (must match a registered body ID — i.e. the string
   * Telemachus returns for v.body, e.g. "Mun", "Duna").
   */
  targetBody: string;
}

function DistanceToTargetComponent({ config }: ComponentProps<DistanceToTargetConfig>) {
  const targetBodyId = config?.targetBody;

  // Telemachus-provided values for the current in-game target
  const tarDistance = useDataValue<number>('telemachus', 'tar.distance');
  const tarName     = useDataValue<string>('telemachus', 'tar.name');

  const body = targetBodyId ? getBody(targetBodyId) : undefined;
  const displayName = body?.name ?? targetBodyId ?? '—';

  if (!targetBodyId) {
    return (
      <Panel>
        <Title>TARGET</Title>
        <NoTarget>No target body configured</NoTarget>
      </Panel>
    );
  }

  // Check whether the current KSP target matches the configured body
  const isTargeted =
    tarName !== undefined &&
    tarName.toLowerCase() === targetBodyId.toLowerCase();

  return (
    <Panel>
      <Title>TARGET</Title>
      <BodyName>{displayName}</BodyName>

      {isTargeted && tarDistance !== undefined ? (
        <>
          <Distance>{formatDistance(tarDistance)}</Distance>
          <Closing>● targeting</Closing>
        </>
      ) : tarName !== undefined && !isTargeted ? (
        <NotTargeted>
          Set <em>{displayName}</em> as target in KSP
          <br />
          <Hint>(currently targeting {tarName})</Hint>
        </NotTargeted>
      ) : (
        <NotTargeted>No target set in KSP</NotTargeted>
      )}
    </Panel>
  );
}

registerComponent<DistanceToTargetConfig>({
  id: 'distance-to-target',
  name: 'Distance to Target',
  category: 'telemetry',
  component: DistanceToTargetComponent,
  dataRequirements: ['tar.distance', 'tar.name'],
  behaviors: [],
  defaultConfig: { targetBody: 'Mun' },
});

export { DistanceToTargetComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const Panel = styled.div`
  background: #0d0d0d;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 12px 16px;
  font-family: monospace;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #555;
  text-transform: uppercase;
`;

const BodyName = styled.div`
  font-size: 13px;
  color: #ccc;
  letter-spacing: 0.05em;
`;

const Distance = styled.div`
  font-size: 22px;
  font-weight: 600;
  color: #00ff88;
  letter-spacing: 0.02em;
  line-height: 1.1;
`;

const Closing = styled.div`
  font-size: 10px;
  color: #444;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const NotTargeted = styled.div`
  font-size: 11px;
  color: #555;
  line-height: 1.5;
  em {
    color: #888;
    font-style: normal;
  }
`;

const Hint = styled.span`
  color: #444;
  font-size: 10px;
`;

const NoTarget = styled.div`
  font-size: 11px;
  color: #444;
`;
