import { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import { registerComponent, useDataValue, getBody, getAllBodies } from '@gonogo/core';
import { formatDistance } from '@gonogo/core';
import type { ComponentProps } from '@gonogo/core';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DistanceToTargetConfig {}

const STORAGE_KEY = 'gonogo:distance-to-target:body';

function DistanceToTargetComponent(_props: ComponentProps<DistanceToTargetConfig>) {
  // Target body persisted in localStorage
  const [targetBodyId, setTargetBodyId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );
  const [configOpen, setConfigOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Telemachus-provided values for the current in-game target
  const tarDistance = useDataValue<number>('telemachus', 'tar.distance');
  const tarName     = useDataValue<string>('telemachus', 'tar.name');

  // Persist selection
  function selectBody(id: string) {
    localStorage.setItem(STORAGE_KEY, id);
    setTargetBodyId(id);
    setConfigOpen(false);
  }

  // Close config panel on outside click
  useEffect(() => {
    if (!configOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setConfigOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [configOpen]);

  const body = targetBodyId ? getBody(targetBodyId) : undefined;
  const displayName = body?.name ?? targetBodyId ?? '—';

  const isTargeted =
    tarName !== undefined &&
    targetBodyId !== null &&
    tarName.toLowerCase() === targetBodyId.toLowerCase();

  const bodies = getAllBodies().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Panel ref={panelRef}>
      <TitleRow>
        <Title>TARGET</Title>
        <ConfigButton
          onClick={() => setConfigOpen((o) => !o)}
          aria-label="Configure target body"
          $active={configOpen}
        >
          ⚙
        </ConfigButton>
      </TitleRow>

      {configOpen && (
        <ConfigPanel>
          <ConfigLabel>Select target body</ConfigLabel>
          <BodyList>
            {bodies.map((b) => (
              <BodyOption
                key={b.id}
                onClick={() => selectBody(b.id)}
                $selected={b.id === targetBodyId}
              >
                {b.name}
              </BodyOption>
            ))}
          </BodyList>
        </ConfigPanel>
      )}

      {!configOpen && (
        <>
          {targetBodyId === null ? (
            <NoTarget>No target body set — use ⚙ to configure</NoTarget>
          ) : (
            <>
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
            </>
          )}
        </>
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
  defaultConfig: {},
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
  position: relative;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #555;
  text-transform: uppercase;
`;

const ConfigButton = styled.button<{ $active: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: ${({ $active }) => ($active ? '#00ff88' : '#444')};
  padding: 0 0 0 8px;
  line-height: 1;

  &:hover {
    color: #888;
  }
`;

const ConfigPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ConfigLabel = styled.div`
  font-size: 10px;
  color: #555;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 2px;
`;

const BodyList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 200px;
  overflow-y: auto;
`;

const BodyOption = styled.button<{ $selected: boolean }>`
  background: ${({ $selected }) => ($selected ? '#1a2a1a' : 'none')};
  border: 1px solid ${({ $selected }) => ($selected ? '#00ff8840' : 'transparent')};
  border-radius: 2px;
  color: ${({ $selected }) => ($selected ? '#00ff88' : '#888')};
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
  padding: 4px 8px;
  text-align: left;

  &:hover {
    background: #1a1a1a;
    color: #ccc;
  }
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
