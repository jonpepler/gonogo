import { formatDistance, registerComponent, useDataValue } from "@gonogo/core";
import styled from "styled-components";

function DistanceToTargetComponent() {
  const tarDistance = useDataValue("telemachus", "tar.distance");
  const tarName = useDataValue("telemachus", "tar.name");

  return (
    <Panel>
      <Title>TARGET</Title>

      {tarName === undefined ? (
        <NoTarget>No target set in KSP</NoTarget>
      ) : (
        <>
          <TargetName>{tarName}</TargetName>
          {tarDistance === undefined ? (
            <Dash>—</Dash>
          ) : (
            <Distance>{formatDistance(tarDistance)}</Distance>
          )}
        </>
      )}
    </Panel>
  );
}

registerComponent({
  id: "distance-to-target",
  name: "Distance to Target",
  description: "Shows the name and distance to the current KSP target.",
  tags: ["telemetry"],
  defaultSize: { w: 2, h: 3 },
  component: DistanceToTargetComponent,
  dataRequirements: ["tar.distance", "tar.name"],
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
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #555;
  text-transform: uppercase;
`;

const TargetName = styled.div`
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

const Dash = styled.div`
  font-size: 22px;
  font-weight: 600;
  color: #333;
`;

const NoTarget = styled.div`
  font-size: 11px;
  color: #444;
`;
