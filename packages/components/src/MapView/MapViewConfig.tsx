import type { ConfigComponentProps } from "@gonogo/core";
import { useDataSchema } from "@gonogo/data";
import {
  ConfigForm,
  DataKeyMultiPicker,
  Field,
  FieldHint,
  FieldLabel,
  FieldRow,
  Input,
  PrimaryButton,
  Switch,
} from "@gonogo/ui";
import { useMemo, useState } from "react";
import type { MapViewConfig } from "./types";

export function MapViewConfigComponent({
  config,
  onSave,
}: Readonly<ConfigComponentProps<MapViewConfig>>) {
  const [trajectoryLength, setTrajectoryLength] = useState(
    String(config?.trajectoryLength ?? 2000),
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(config?.telemetryKeys ?? []),
  );
  const [showPrediction, setShowPrediction] = useState(
    config?.showPrediction ?? true,
  );

  const allKeys = useDataSchema("data");

  // Show numeric keys only — exclude booleans, enums and raw values that
  // aren't meaningful in a small telemetry panel.
  const numericKeys = useMemo(
    () =>
      allKeys.filter(
        (k) =>
          k.unit !== "bool" &&
          k.unit !== "enum" &&
          k.unit !== "raw" &&
          k.group !== "Actions",
      ),
    [allKeys],
  );

  const handleSave = () => {
    const keys = numericKeys.map((k) => k.key).filter((k) => selected.has(k));
    onSave({
      trajectoryLength: Math.max(
        1,
        Number.parseInt(trajectoryLength, 10) || 2000,
      ),
      telemetryKeys: keys.length > 0 ? keys : undefined,
      showPrediction,
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
          max={10000}
          value={trajectoryLength}
          onChange={(e) => setTrajectoryLength(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel>Overlays</FieldLabel>
        <FieldRow>
          <Switch
            checked={showPrediction}
            onChange={setShowPrediction}
            label="Trajectory prediction"
          />
        </FieldRow>
      </Field>
      <Field>
        <FieldLabel>Telemetry panel</FieldLabel>
        <DataKeyMultiPicker
          keys={numericKeys}
          value={selected}
          onChange={setSelected}
          emptyHint="Connect a data source to see available keys."
        />
        <FieldHint>Selected values are shown below the map.</FieldHint>
      </Field>
      <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
    </ConfigForm>
  );
}
