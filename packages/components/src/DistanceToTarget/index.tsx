import { formatDistance, registerComponent, useDataValue } from "@gonogo/core";
import { Panel, PanelTitle } from "@gonogo/ui";
import styled from "styled-components";

function DistanceToTargetComponent() {
  const tarDistance = useDataValue("data", "tar.distance");
  const tarName = useDataValue("data", "tar.name");

  return (
    <Panel>
      <PanelTitle>TARGET</PanelTitle>

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
  defaultSize: { w: 6, h: 9 },
  component: DistanceToTargetComponent,
  dataRequirements: ["tar.distance", "tar.name"],
  behaviors: [],
  defaultConfig: {},
});

export { DistanceToTargetComponent };

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
