import type { ComponentProps } from "@gonogo/core";
import {
  formatDistance,
  formatDuration,
  getBody,
  registerComponent,
  useDataValue,
} from "@gonogo/core";
import { Panel, PanelSubtitle, PanelTitle } from "@gonogo/ui";
import styled from "styled-components";
import { OrbitDiagram } from "../shared/OrbitDiagram";
import { useIsOrbiting } from "../shared/useIsOrbiting";

interface CurrentOrbitConfig {
  /** Show the mini SVG orbit diagram. Default: true. */
  showDiagram?: boolean;
}

function CurrentOrbitComponent({
  config,
}: Readonly<ComponentProps<CurrentOrbitConfig>>) {
  const showDiagram = config?.showDiagram ?? true;

  const apoapsisA = useDataValue("telemachus", "o.ApA");
  const periapsisA = useDataValue("telemachus", "o.PeA");
  const apoapsisR = useDataValue("telemachus", "o.ApR");
  const periapsisR = useDataValue("telemachus", "o.PeR");
  const sma = useDataValue("telemachus", "o.sma");
  const eccentricity = useDataValue("telemachus", "o.eccentricity");
  const trueAnomaly = useDataValue("telemachus", "o.trueAnomaly");
  const argPe = useDataValue("telemachus", "o.argumentOfPeriapsis");
  const inclination = useDataValue("telemachus", "o.inclination");
  const period = useDataValue("telemachus", "o.period");
  const timeToAp = useDataValue("telemachus", "o.timeToAp");
  const timeToPe = useDataValue("telemachus", "o.timeToPe");
  const refBody = useDataValue("telemachus", "o.referenceBody");
  const bodyName = useDataValue("telemachus", "v.body");

  const body =
    (bodyName ?? refBody) === undefined
      ? undefined
      : getBody(bodyName ?? refBody ?? "");
  const { isOrbiting } = useIsOrbiting();

  const hasOrbit =
    sma !== undefined &&
    eccentricity !== undefined &&
    apoapsisR !== undefined &&
    periapsisR !== undefined;

  return (
    <Panel>
      <PanelTitle>ORBIT</PanelTitle>
      {refBody !== undefined && <PanelSubtitle>{refBody}</PanelSubtitle>}

      <Grid>
        <Label>Ap</Label>
        <Value $accent="ap">
          {apoapsisA === undefined ? "—" : formatDistance(apoapsisA)}
        </Value>

        <Label>Pe</Label>
        <Value $accent="pe">
          {periapsisA === undefined ? "—" : formatDistance(periapsisA)}
        </Value>

        <Label>Ecc</Label>
        <Value>
          {eccentricity === undefined ? "—" : eccentricity.toFixed(4)}
        </Value>

        <Label>Inc</Label>
        <Value>
          {inclination === undefined ? "—" : `${inclination.toFixed(1)}°`}
        </Value>

        <Label>T</Label>
        <Value>{period === undefined ? "—" : formatDuration(period)}</Value>

        <Label>t-Ap</Label>
        <Value $accent="ap">
          {timeToAp === undefined ? "—" : formatDuration(timeToAp)}
        </Value>

        <Label>t-Pe</Label>
        <Value $accent="pe">
          {timeToPe === undefined ? "—" : formatDuration(timeToPe)}
        </Value>
      </Grid>

      {showDiagram && hasOrbit && (
        <MiniDiagramWrap>
          <OrbitDiagram
            variant="mini"
            sma={sma}
            ecc={eccentricity}
            apoapsis={apoapsisR}
            periapsis={periapsisR}
            trueAnomaly={trueAnomaly ?? 0}
            argPe={argPe ?? 0}
            bodyColor={body?.color}
            bodyRadius={body?.radius}
            isOrbiting={isOrbiting}
          />
        </MiniDiagramWrap>
      )}
    </Panel>
  );
}

registerComponent<CurrentOrbitConfig>({
  id: "current-orbit",
  name: "Current Orbit",
  description:
    "Displays orbital parameters: apoapsis, periapsis, eccentricity, inclination, period, and time to Ap/Pe.",
  tags: ["telemetry"],
  defaultSize: { w: 9, h: 18 },
  component: CurrentOrbitComponent,
  dataRequirements: [
    "o.ApA",
    "o.PeA",
    "o.ApR",
    "o.PeR",
    "o.sma",
    "o.eccentricity",
    "o.trueAnomaly",
    "o.argumentOfPeriapsis",
    "o.inclination",
    "o.period",
    "o.timeToAp",
    "o.timeToPe",
    "o.referenceBody",
    "v.body",
  ],
  behaviors: [],
  defaultConfig: { showDiagram: true },
});

export { CurrentOrbitComponent };

const Grid = styled.div`
  display: grid;
  grid-template-columns: 3em 1fr;
  gap: 2px 8px;
  align-items: baseline;
`;

const Label = styled.span`
  font-size: 10px;
  color: #555;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

const accentColor = {
  ap: "#ff8c00",
  pe: "#4499ff",
};

const Value = styled.span<{ $accent?: "ap" | "pe" }>`
  font-size: 13px;
  color: ${({ $accent }) => ($accent ? accentColor[$accent] : "#ccc")};
  letter-spacing: 0.03em;
`;

const MiniDiagramWrap = styled.div`
  height: 80px;
  flex-shrink: 0;
  margin-top: 4px;
  display: flex;
`;
