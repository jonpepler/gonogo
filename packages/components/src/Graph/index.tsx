import type { ComponentProps, ConfigComponentProps } from "@gonogo/core";
import { registerComponent } from "@gonogo/core";
import { useDataSchema } from "@gonogo/data";
import type { DataKeyMeta, SeriesRange } from "@gonogo/data";
import {
  ConfigForm,
  DataKeyPicker,
  Field,
  FieldLabel,
  Input,
  Panel,
  PanelTitle,
  PrimaryButton,
  Select,
} from "@gonogo/ui";
import type { ChartSeries } from "@gonogo/ui";
import { LineChart } from "@gonogo/ui";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import styled from "styled-components";
import { GraphSeries } from "./GraphSeries";
import { paletteColor } from "./palette";
import type { GraphConfig, GraphSeriesConfig } from "./types";

// ── Axis resolution ───────────────────────────────────────────────────────────

function resolveAxes(
  configs: GraphSeriesConfig[],
  metaMap: Map<string, DataKeyMeta>,
): Array<"primary" | "secondary"> {
  if (configs.every((c) => c.axis !== "auto")) {
    return configs.map((c) => c.axis as "primary" | "secondary");
  }
  const units = configs.map((c) => metaMap.get(c.key)?.unit ?? "raw");
  const seen: string[] = [];
  for (const u of units) {
    if (!seen.includes(u)) seen.push(u);
  }
  return configs.map((c) => {
    if (c.axis !== "auto") return c.axis as "primary" | "secondary";
    const u = metaMap.get(c.key)?.unit ?? "raw";
    return seen.indexOf(u) === 0 ? "primary" : "secondary";
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

function GraphComponent({ config }: Readonly<ComponentProps<GraphConfig>>) {
  const series = config?.series ?? [];
  const windowSec = config?.windowSec ?? 300;

  const schema = useDataSchema("data");
  const metaMap = new Map(schema.map((k) => [k.key, k]));

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Collected numeric series data from child GraphSeries components.
  const [seriesData, setSeriesData] = useState<
    Map<string, SeriesRange<number>>
  >(new Map());

  const handleData = useCallback((key: string, data: SeriesRange<number>) => {
    setSeriesData((prev) => {
      const next = new Map(prev);
      next.set(key, data);
      return next;
    });
  }, []);

  const axes = resolveAxes(series, metaMap);
  const hasThirdUnit = (() => {
    const units = series.map((c) => metaMap.get(c.key)?.unit ?? "raw");
    return new Set(units).size > 2;
  })();

  const chartSeries: ChartSeries[] = series.map((cfg, i) => {
    const meta = metaMap.get(cfg.key);
    const data = seriesData.get(cfg.key) ?? { t: [], v: [] };
    return {
      id: cfg.id,
      label: cfg.label ?? meta?.label ?? cfg.key,
      axis: axes[i],
      color: cfg.color ?? paletteColor(i),
      data,
    };
  });

  const now = Date.now();
  const xDomain: [number, number] = [now - windowSec * 1000, now];

  return (
    <Panel>
      <Header>
        <PanelTitle>GRAPH</PanelTitle>
      </Header>
      {series.length === 0 ? (
        <EmptyState>Configure series to begin graphing.</EmptyState>
      ) : (
        <ChartArea ref={containerRef}>
          {size && (
            <LineChart
              series={chartSeries}
              xDomain={xDomain}
              width={size.w}
              height={size.h}
            />
          )}
          {hasThirdUnit && (
            <AxisWarning>Add explicit axes to plot 3+ units</AxisWarning>
          )}
        </ChartArea>
      )}
      {/* Invisible data-fetcher components, one per series */}
      {series.map((cfg) => (
        <GraphSeries
          key={cfg.id}
          dataKey={cfg.key}
          windowSec={windowSec}
          onData={handleData}
        />
      ))}
    </Panel>
  );
}

// ── Config component ──────────────────────────────────────────────────────────

function GraphConfigComponent({
  config,
  onSave,
}: Readonly<ConfigComponentProps<GraphConfig>>) {
  const [seriesList, setSeriesList] = useState<GraphSeriesConfig[]>(
    config?.series ?? [],
  );
  const [windowSec, setWindowSec] = useState(String(config?.windowSec ?? 300));

  const schema = useDataSchema("data");
  const numericKeys = schema.filter(
    (k) =>
      k.unit !== "bool" && k.unit !== "enum" && k.unit !== "raw" && k.group !== "Actions",
  );

  const addSeries = () => {
    setSeriesList((prev) => [
      ...prev,
      { id: crypto.randomUUID(), key: "", axis: "auto" },
    ]);
  };

  const updateSeries = (id: string, patch: Partial<GraphSeriesConfig>) => {
    setSeriesList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  const removeSeries = (id: string) => {
    setSeriesList((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = () => {
    onSave({
      style: "time-series",
      series: seriesList.filter((s) => s.key !== ""),
      windowSec: Math.max(10, Number.parseInt(windowSec, 10) || 300),
    });
  };

  return (
    <ConfigForm>
      <Field>
        <FieldLabel>Series</FieldLabel>
        {seriesList.map((s, i) => (
          <SeriesRow key={s.id}>
            <DataKeyPicker
              keys={numericKeys}
              value={s.key || null}
              onChange={(k) => updateSeries(s.id, { key: k ?? "" })}
              placeholder="Pick a key…"
              clearable
            />
            <Select
              value={s.axis}
              onChange={(e) =>
                updateSeries(s.id, {
                  axis: e.target.value as GraphSeriesConfig["axis"],
                })
              }
            >
              <option value="auto">Auto axis</option>
              <option value="primary">Primary (left)</option>
              <option value="secondary">Secondary (right)</option>
            </Select>
            <RemoveButton type="button" onClick={() => removeSeries(s.id)}>
              ×
            </RemoveButton>
          </SeriesRow>
        ))}
        <AddButton type="button" onClick={addSeries}>
          + Add series
        </AddButton>
      </Field>
      <Field>
        <FieldLabel htmlFor="graph-window">Window (seconds)</FieldLabel>
        <Input
          id="graph-window"
          type="number"
          min={10}
          max={3600}
          value={windowSec}
          onChange={(e) => setWindowSec(e.target.value)}
        />
      </Field>
      <PrimaryButton onClick={handleSave}>Save</PrimaryButton>
    </ConfigForm>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid #222;
`;

const ChartArea = styled.div`
  flex: 1;
  position: relative;
  min-height: 0;
`;

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #555;
  font-family: monospace;
`;

const AxisWarning = styled.div`
  position: absolute;
  bottom: 4px;
  right: 8px;
  font-size: 10px;
  color: #ff8c00;
  background: rgba(0, 0, 0, 0.7);
  padding: 2px 6px;
  border-radius: 2px;
  pointer-events: none;
`;

const SeriesRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 6px;
`;

const AddButton = styled.button`
  background: none;
  border: 1px dashed #444;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  font-family: monospace;
  padding: 4px 8px;
  width: 100%;
  margin-top: 4px;
  &:hover { color: #ccc; border-color: #666; }
`;

const RemoveButton = styled.button`
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
  flex-shrink: 0;
  &:hover { color: #ccc; }
`;

// ── Registration ──────────────────────────────────────────────────────────────

registerComponent<GraphConfig>({
  id: "graph",
  name: "Graph",
  description: "Line chart of one or more live telemetry series over time.",
  tags: ["telemetry", "graph"],
  defaultSize: { w: 10, h: 8 },
  component: GraphComponent,
  configComponent: GraphConfigComponent,
  openConfigOnAdd: true,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: { style: "time-series", series: [], windowSec: 300 },
  actions: [],
});

export { GraphComponent };
