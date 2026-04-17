import type { ConfigComponentProps, TelemaachusSchema } from "@gonogo/core";
import {
  ConfigForm,
  Field,
  FieldHint,
  FieldLabel,
  Input,
  PrimaryButton,
} from "@gonogo/ui";
import { useState } from "react";
import { Checkbox, CheckLabel, CheckList, CheckRow } from "./MapView.styles";
import type { MapViewConfig } from "./types";

export const TELEMETRY_OPTIONS: {
  label: string;
  key: keyof TelemaachusSchema;
}[] = [
  { label: "Altitude (sea level)", key: "v.altitude" },
  { label: "Altitude (terrain)", key: "v.heightFromTerrain" },
  { label: "Vertical speed", key: "v.verticalSpeed" },
  { label: "Surface speed", key: "v.surfaceSpeed" },
  { label: "Orbital speed", key: "v.obtSpeed" },
  { label: "Mach", key: "v.mach" },
  { label: "G-force", key: "v.geeForce" },
  { label: "Heading", key: "n.heading" },
  { label: "Pitch", key: "n.pitch" },
  { label: "Roll", key: "n.roll" },
  { label: "Mission time", key: "v.missionTime" },
  { label: "Apoapsis alt", key: "o.ApA" },
  { label: "Periapsis alt", key: "o.PeA" },
  { label: "Time to Ap", key: "o.timeToAp" },
  { label: "Time to Pe", key: "o.timeToPe" },
  { label: "Inclination", key: "o.inclination" },
  { label: "Latitude", key: "v.lat" },
  { label: "Longitude", key: "v.long" },
];

export function MapViewConfigComponent({
  config,
  onSave,
}: Readonly<ConfigComponentProps<MapViewConfig>>) {
  const [trajectoryLength, setTrajectoryLength] = useState(
    String(config?.trajectoryLength ?? 200),
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(config?.telemetryKeys ?? []),
  );

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    const keys = TELEMETRY_OPTIONS.map((o) => o.key).filter((k) =>
      selected.has(k),
    );
    onSave({
      trajectoryLength: Math.max(
        1,
        Number.parseInt(trajectoryLength, 10) || 200,
      ),
      telemetryKeys: keys.length > 0 ? keys : undefined,
    });
  };

  return (
    <ConfigForm>
      <Field>
        <FieldLabel htmlFor="map-traj">Trajectory history (points)</FieldLabel>
        <Input
          id="map-traj"
          type="number"
          min={1}
          max={2000}
          value={trajectoryLength}
          onChange={(e) => setTrajectoryLength(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Telemetry panel</FieldLabel>
        <CheckList>
          {TELEMETRY_OPTIONS.map(({ label, key }) => (
            <CheckRow key={key}>
              <Checkbox
                id={`map-key-${key}`}
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => toggleKey(key)}
              />
              <CheckLabel htmlFor={`map-key-${key}`}>{label}</CheckLabel>
            </CheckRow>
          ))}
        </CheckList>
        <FieldHint>Selected values are shown below the map.</FieldHint>
      </Field>
      <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
    </ConfigForm>
  );
}
