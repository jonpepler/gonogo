import type { ConfigComponentProps } from "@gonogo/core";
import { useDataSchema } from "@gonogo/data";
import {
  ConfigForm,
  Field,
  FieldHint,
  FieldLabel,
  Input,
  PrimaryButton,
} from "@gonogo/ui";
import { useMemo, useState } from "react";
import styled from "styled-components";
import { Checkbox, CheckLabel, CheckList, CheckRow } from "./MapView.styles";
import type { MapViewConfig } from "./types";

const GroupLabel = styled.div`
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #555;
  margin-top: 10px;
  margin-bottom: 4px;
`;

const EmptyHint = styled.div`
  font-size: 11px;
  color: #555;
  padding: 4px 0;
`;

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

  // Group for display, alphabetical within each group.
  const groups = useMemo(() => {
    const map = new Map<string, typeof numericKeys>();
    for (const k of numericKeys) {
      const g = k.group ?? "Other";
      let bucket = map.get(g);
      if (!bucket) {
        bucket = [];
        map.set(g, bucket);
      }
      bucket.push(k);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [numericKeys]);

  const toggleKey = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = () => {
    const keys = numericKeys.map((k) => k.key).filter((k) => selected.has(k));
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
          {groups.map(([group, items]) => (
            <div key={group}>
              <GroupLabel>{group}</GroupLabel>
              {items.map(({ label, key }) => (
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
            </div>
          ))}
          {numericKeys.length === 0 && (
            <EmptyHint>Connect a data source to see available keys.</EmptyHint>
          )}
        </CheckList>
        <FieldHint>Selected values are shown below the map.</FieldHint>
      </Field>
      <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
    </ConfigForm>
  );
}
