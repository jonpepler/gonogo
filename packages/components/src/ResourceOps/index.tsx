import type { ActionDefinition, ComponentProps } from "@ksp-gonogo/core";
import {
  registerComponent,
  useActionInput,
  useTelemetry,
} from "@ksp-gonogo/core";
import { useCommand } from "@ksp-gonogo/sitrep-client";
import type {
  CommandResult,
  IsruConverterEntry,
  IsruDrillEntry,
  IsruResourceFlow,
} from "@ksp-gonogo/sitrep-sdk";
import { CommandErrorCode, value } from "@ksp-gonogo/sitrep-sdk";
import {
  ActionButton,
  Badge,
  Card,
  Cluster,
  EmptyState,
  FilterList,
  type FilterRow,
  Grid,
  Inline,
  Panel,
  ReadoutCaption,
  resourceColor,
  ScrollArea,
  Stack,
  Truncate,
  Unit,
  usePanelDelay,
  Value,
} from "@ksp-gonogo/ui-kit";
import { useMemo, useState } from "react";
import { magnitudeOf, type Quantityish } from "../shared/magnitude";

/**
 * In-situ resource operations: every drill and every chemical converter on the
 * active vessel, at live rates.
 *
 * SOURCE-AGNOSTIC BY DESIGN, mod-side. `isru.*` is ONE Kernel-elected capability
 * publishing a single `isru.drills` / `isru.converters` pair, filled by whichever
 * backend won the election (stock, or a mod that replaces stock ISRU wholesale).
 * So this widget consumes ONE shape and renders identically whichever backend
 * answered. It never branches on which mod is installed, and it never imports a
 * provider's package.
 *
 * <b>The provider extension bag is deliberately not read here.</b> Each entry can
 * carry a provider-namespaced sub-tree (a blocking-reason string, an asteroid's
 * remaining mass, a process throttle), and reading it means importing the
 * provider's own typed accessor, which is exactly what a base widget must not do.
 * Every row below is complete from the shared fields alone, so there is no
 * empty-looking provider-shaped hole to explain on a stock install. Layering that
 * detail on is an augment's job, in the provider's own package.
 *
 * FILTERS ARE CONTRIBUTED, NEVER HARDCODED. The list is filtered by a mounted
 * `FilterList`, which owns its own `filters` contribution slot: a provider that
 * knows how these rows divide up (a mod's per-process axis) contributes
 * pre-filled SEARCH TERMS to that slot from its own Uplink, and they filter
 * against the `searchText` this widget bakes from its SHARED fields alone
 * (`partTitle`, kind, resource names). The widget holds no taxonomy: it could
 * not assert a life-support-versus-ISRU split even if it wanted to, and the
 * operator can always type a resource or part name into the same box.
 *
 * ACTIVE-VESSEL SCOPED: both channels capture off the active vessel only, the same
 * carry-gap `reliability.*` has. An empty list means this vessel has no drills or
 * converters, never that ISRU is untracked: stock genuinely models ISRU, so the
 * elected backend always has a real answer.
 *
 * LOCATION: both `IsruDrillEntry` and `IsruConverterEntry` carry `vesselId`/
 * `vesselName`/`parentBodyIndex`, populated mod-side from each part's own live
 * vessel (not `FlightGlobals.ActiveVessel`), so a row's location is correct even
 * the day a capture widens past the single active vessel. Today every row's
 * value is identical (both channels are still active-vessel-scoped, see above),
 * so the SINGLE-vessel case keeps the plain header line below: "is this all in
 * one place, on a vessel, on Duna", sourced from `vessel.identity`/`system.bodies`
 * exactly as before. The moment more than one distinct `vesselId` shows up across
 * the two lists, each card grows its own location caption instead (the header
 * line would be a lie for a mixed list), so nothing about the widget's steady
 * state today changes.
 *
 * DEVICE CONTROL: each card carries a start/stop toggle
 * (`isru.setDrillEnabled`/`isru.setConverterEnabled`), firing stock's own
 * `ModuleResourceHarvester`/`ModuleResourceConverter.StartResourceConverter`/
 * `StopResourceConverter` (both inherited unmodified from `BaseConverter`, so one
 * mod-side write path serves both entry kinds). FAIL-SOFT: a backend with no
 * write path (Kerbalism, today) reports `CommandErrorCode.ModeUnavailable`
 * rather than the button silently doing nothing. Deploy/retract (drills only,
 * `ModuleAnimationGroup`) and the harvester/converter's other KSP-side surface
 * (`AutoShutdown`, `SetEfficiencyBonus`, multi-recipe parts) are NOT built here;
 * start/stop is the obvious control, the rest is a follow-up.
 */

type ResourceOpsConfig = Record<string, never>;

const resourceOpsActions = [
  {
    id: "next",
    label: "Next unit",
    accepts: ["button"],
    description:
      "Steps the highlighted drill or converter, so a hardware panel can walk the list and show one unit at a time.",
  },
] as const satisfies readonly ActionDefinition[];

export type ResourceOpsActions = typeof resourceOpsActions;

/** Resource | rate | flow-direction, shared by every process card's table. */
const RESOURCE_TABLE_COLS = "minmax(0, 1fr) auto auto";
const RIGHT_ALIGN = { textAlign: "right" } as const;
/**
 * `Value`-equivalent typography for the resource-name cell, applied to
 * `Truncate` (which carries no size/tone props of its own). A long resource
 * name (`ElectricCharge`, `CarbonDioxide`) needs to ellipsize rather than
 * overflow into the rate column: the track alone (`minmax(0, 1fr)`) is not
 * enough, a grid item's own implicit `min-width: auto` still refuses to
 * shrink below its content unless the item itself carries `min-width: 0`,
 * which is exactly what `Truncate` sets (mirrors `FleetRoster`'s identical
 * fix on its own name column).
 */
const RESOURCE_NAME_STYLE = {
  fontSize: "var(--font-size-xs)",
  color: "var(--color-text-primary)",
} as const;

/**
 * A touch roomier VERTICALLY than `Card`'s own default (`--space-6
 * --space-8`, tuned for a compact single-line row): a process card stacks a
 * whole table, so the top/bottom inset steps up to `--space-8` to keep the
 * table off the card's edge. The horizontal inset is left at the card
 * default: the resource-name column is already squeezed to a `minmax(0,
 * 1fr)` track against two `auto`-width columns (rate, direction) at this
 * widget's registered 6-column default width, and widening the horizontal
 * inset directly steals from that track, making names truncate harder. A
 * `style` override rather than a `Card` prop change, so the bump stays
 * scoped to this widget's cards instead of every `Card` in the app.
 */
const CARD_PADDING = {
  padding: "var(--space-8) var(--space-8)",
} as const;

/**
 * Enough decimal places to show a rate as nonzero: `base` for an ordinary
 * magnitude, widened to two significant digits below it. Life-support rates
 * genuinely sit at 0.0002 units/s, and a fixed precision flattens that to
 * "0.000", which reads as a dead process rather than a slow one.
 */
function rateDecimals(rate: Quantityish, base: number): number {
  const magnitude = magnitudeOf(rate);
  if (magnitude === null || magnitude === 0) return base;
  const twoSignificant = 1 - Math.floor(Math.log10(Math.abs(magnitude)));
  return Math.min(6, Math.max(base, twoSignificant));
}

/**
 * Net ElectricCharge draw across every RUNNING converter (inputs minus
 * outputs), the one cheap power aggregate the shared shape supports: drills
 * carry no EC field of their own. `null` (not 0) when nothing on the vessel
 * touches ElectricCharge at all, so the header omits the stat rather than
 * claiming a known zero draw. A positive number draws power; negative means
 * the fleet is a net generator (e.g. a running fuel cell).
 */
function netElectricChargeDraw(
  converters: readonly IsruConverterEntry[],
): number | null {
  let touched = false;
  let net = 0;
  for (const converter of converters) {
    for (const flow of converter.inputs) {
      if (flow.resource !== "ElectricCharge") continue;
      touched = true;
      if (converter.running === true) net += magnitudeOf(flow.rate) ?? 0;
    }
    for (const flow of converter.outputs) {
      if (flow.resource !== "ElectricCharge") continue;
      touched = true;
      if (converter.running === true) net -= magnitudeOf(flow.rate) ?? 0;
    }
  }
  return touched ? net : null;
}

/** `parentBodyIndex` -> body name, the same `system.bodies` join the header's own `bodyName` uses. */
function bodyNameOf(
  index: number | null | undefined,
  bodyNames: ReadonlyMap<number, string | undefined>,
): string | undefined {
  return index != null ? bodyNames.get(index) : undefined;
}

/** A card's own location caption: "<vessel> · <body>", either half optional. */
function locationCaption(
  vesselName: string | null | undefined,
  parentBodyIndex: number | null | undefined,
  bodyNames: ReadonlyMap<number, string | undefined>,
): string | undefined {
  const body = bodyNameOf(parentBodyIndex, bodyNames);
  if (!vesselName) return body;
  return body ? `${vesselName} · ${body}` : vesselName;
}

/**
 * Start/stop toggle for one drill or converter. Fires
 * `isru.setDrillEnabled`/`isru.setConverterEnabled` with an ABSOLUTE state
 * (never a bare toggle, matching every other actuation command in the
 * contract): `{ partId, enabled: !running }`. Mod-side this reaches stock's
 * own `StartResourceConverter`/`StopResourceConverter`, inherited unmodified
 * by both `ModuleResourceHarvester` and `ModuleResourceConverter` from
 * `BaseConverter`, so the same command shape serves either card kind.
 *
 * FAIL-SOFT: a backend with no real write path (Kerbalism, today) answers
 * `CommandErrorCode.ModeUnavailable` rather than the button silently doing
 * nothing; that comes back as a confirmed `CommandResult` with `success:
 * false`, surfaced here as a small warning badge rather than swallowed.
 */
function ProcessToggle({
  command,
  partId,
  running,
}: Readonly<{
  command: "isru.setDrillEnabled" | "isru.setConverterEnabled";
  partId: string | null | undefined;
  running: boolean | null | undefined;
}>) {
  const cmd = useCommand(command);
  // Mandatory: `useCommand`'s own dispatch-time assertion requires every
  // handle be wired to the panel's shared delay rail, no opt-out, so a
  // per-card toggle's signal delay is exactly as visible as any other
  // command in the widget.
  usePanelDelay(cmd);
  const pending = cmd.status.phase === "in-flight";
  const result =
    cmd.status.phase === "confirmed"
      ? (cmd.status.result as CommandResult | undefined)
      : undefined;
  const failed = result !== undefined && result.success === false;

  // No id at all can never round-trip to a real part on the vessel: nothing
  // to command, so no control to show (matches PartActionCommandProvider's
  // own NotFound-on-empty-id posture, one layer up).
  if (!partId) {
    return null;
  }

  return (
    <>
      <ActionButton
        type="button"
        tone={running ? "ghost" : "go"}
        disabled={pending}
        onClick={() =>
          void cmd.send(
            { partId, enabled: !running },
            { label: running ? "Stop" : "Start" },
          )
        }
      >
        {pending ? "…" : running ? "Stop" : "Start"}
      </ActionButton>
      {failed && (
        <Badge size="sm" severity="warning">
          {result.errorCode === CommandErrorCode.ModeUnavailable
            ? "not supported"
            : "command failed"}
        </Badge>
      )}
    </>
  );
}

/**
 * One row of a process's resource table: resource name, its rate, and which
 * way it flows ("in" / "out" / "extract"). Returns a FRAGMENT of three flat
 * cells, not its own row wrapper: the enclosing `Grid` is what turns a run of
 * these into aligned columns across every row in the card (CSS grid
 * auto-flow), the same reason `Flows` used to render atomically.
 */
function ResourceCells({
  flow,
  direction,
}: Readonly<{
  flow: IsruResourceFlow;
  direction: "in" | "out" | "extract";
}>) {
  return (
    <>
      <Truncate style={RESOURCE_NAME_STYLE} title={flow.resource ?? undefined}>
        {flow.resource ?? "?"}
      </Truncate>
      <Value size="xs" tone="default" style={RIGHT_ALIGN}>
        {flow.rate !== null && flow.rate !== undefined ? (
          <Unit value={flow.rate} decimals={rateDecimals(flow.rate, 3)} />
        ) : (
          <Value size="xs" tone="faint">
            unknown
          </Value>
        )}
      </Value>
      <ReadoutCaption style={RIGHT_ALIGN}>{direction}</ReadoutCaption>
    </>
  );
}

function DrillCard({
  drill,
  highlighted,
  showLocation,
  bodyNames,
}: Readonly<{
  drill: IsruDrillEntry;
  highlighted: boolean;
  showLocation: boolean;
  bodyNames: ReadonlyMap<number, string | undefined>;
}>) {
  const location = showLocation
    ? locationCaption(drill.vesselName, drill.parentBodyIndex, bodyNames)
    : undefined;

  return (
    <Card
      aria-current={highlighted ? "true" : undefined}
      tone={drill.running ? "go" : "default"}
      categoryColor={drill.resource ? resourceColor(drill.resource) : undefined}
      style={CARD_PADDING}
    >
      <Stack gap="sm">
        {/* Wraps rather than clips: a no-wrap Cluster cut badges off at the
            default tile width. */}
        <Cluster justify="start" gap="sm" wrap>
          <Value size="xs" tone="default" weight="semibold">
            {drill.partTitle ?? drill.partId ?? "Drill"}
          </Value>
          {/* Deployed is genuinely absent on a harvester with no deploy
              animation, so the chip is omitted rather than shown as a false
              "retracted". */}
          {drill.deployed !== null && drill.deployed !== undefined && (
            <Badge size="sm" severity={drill.deployed ? "nominal" : "info"}>
              {drill.deployed ? "deployed" : "retracted"}
            </Badge>
          )}
          <Badge size="sm" severity={drill.running ? "nominal" : "info"}>
            {drill.running ? "running" : "stopped"}
          </Badge>
          <ProcessToggle
            command="isru.setDrillEnabled"
            partId={drill.partId}
            running={drill.running}
          />
        </Cluster>
        {location && (
          <Inline gap="xs">
            <ReadoutCaption>at</ReadoutCaption>
            <Value size="xs" tone="default">
              {location}
            </Value>
          </Inline>
        )}
        <Grid cols={RESOURCE_TABLE_COLS} gap="sm" rowGap="sm" align="baseline">
          <ResourceCells
            flow={{ resource: drill.resource, rate: drill.rate }}
            direction="extract"
          />
        </Grid>
        <Inline gap="xs">
          <ReadoutCaption>abundance</ReadoutCaption>
          {drill.abundance !== null && drill.abundance !== undefined ? (
            <Value size="xs" tone="default">
              <Unit value={drill.abundance} as="%" decimals={2} />
            </Value>
          ) : (
            <Value size="xs" tone="faint">
              unknown
            </Value>
          )}
        </Inline>
      </Stack>
    </Card>
  );
}

function ConverterCard({
  converter,
  highlighted,
  showLocation,
  bodyNames,
}: Readonly<{
  converter: IsruConverterEntry;
  highlighted: boolean;
  showLocation: boolean;
  bodyNames: ReadonlyMap<number, string | undefined>;
}>) {
  // A converter that is on but moving nothing is a starved recipe. That is the
  // derived diagnostic the shared shape is meant to carry, rather than a string
  // no engine actually reports, so it is spelled out here rather than on the wire.
  // A process with NO outputs is exempt: a scrubber or waste processor consumes
  // and dumps by design, and an empty output side is its healthy state, not a
  // stall.
  const starved =
    converter.running === true &&
    converter.outputs.length > 0 &&
    converter.outputs.every((flow) => (flow.rate?.magnitude ?? 0) === 0);

  // The card's identity colour: what it MAKES if it makes anything, else what
  // it consumes. Purely a "what kind of thing is this" mark (Card's top tab),
  // never a status signal, that's `tone` below.
  const primaryResource =
    converter.outputs[0]?.resource ?? converter.inputs[0]?.resource;

  const location = showLocation
    ? locationCaption(
        converter.vesselName,
        converter.parentBodyIndex,
        bodyNames,
      )
    : undefined;

  return (
    <Card
      aria-current={highlighted ? "true" : undefined}
      tone={starved ? "warning" : converter.running ? "go" : "default"}
      categoryColor={
        primaryResource ? resourceColor(primaryResource) : undefined
      }
      style={CARD_PADDING}
    >
      <Stack gap="sm">
        <Cluster justify="start" gap="sm" wrap>
          <Value size="xs" tone="default" weight="semibold">
            {converter.partTitle ?? converter.partId ?? "Converter"}
          </Value>
          <Badge size="sm" severity={converter.running ? "nominal" : "info"}>
            {converter.running ? "running" : "stopped"}
          </Badge>
          {starved && (
            <Badge size="sm" severity="warning">
              no output
            </Badge>
          )}
          <ProcessToggle
            command="isru.setConverterEnabled"
            partId={converter.partId}
            running={converter.running}
          />
        </Cluster>
        {location && (
          <Inline gap="xs">
            <ReadoutCaption>at</ReadoutCaption>
            <Value size="xs" tone="default">
              {location}
            </Value>
          </Inline>
        )}
        {/* The recipe table is the card's core content: every input then every
            output, one row each, columns aligned by the shared Grid template
            rather than the old wrapping inline runs. Either side can be
            genuinely empty (a scrubber has no output; a hypothetical pure
            generator would have no input), and reads as that fact via a
            "none" row rather than a blank gap in the table. */}
        <Grid cols={RESOURCE_TABLE_COLS} gap="sm" rowGap="sm" align="baseline">
          {converter.inputs.length > 0 ? (
            converter.inputs.map((flow, index) => (
              <ResourceCells
                key={`in-${flow.resource ?? index}`}
                flow={flow}
                direction="in"
              />
            ))
          ) : (
            <Value tone="faint" size="xs">
              none
            </Value>
          )}
          {converter.outputs.length > 0 ? (
            converter.outputs.map((flow, index) => (
              <ResourceCells
                key={`out-${flow.resource ?? index}`}
                flow={flow}
                direction="out"
              />
            ))
          ) : (
            // A consume-and-dump process (a scrubber) has no output side by
            // design: this reads as a fact, not a blank row.
            <Value tone="faint" size="xs">
              none
            </Value>
          )}
        </Grid>
      </Stack>
    </Card>
  );
}

/** The resources a converter touches, both recipe sides, as a searchable run. */
function converterResources(converter: IsruConverterEntry): string {
  return [...converter.inputs, ...converter.outputs]
    .map((flow) => flow.resource ?? "")
    .join(" ");
}

/**
 * Whole-widget summary: process count, how many are running, and any cheap
 * aggregate the shared shape supports (net EC draw), plus the vessel/body
 * this whole list is scoped to when that telemetry happens to be mounted.
 * Sits above the scrollable list so it stays visible while the cards scroll
 * underneath it.
 */
function ResourceOpsStats({
  total,
  activeCount,
  netEc,
  location,
}: Readonly<{
  total: number;
  activeCount: number;
  netEc: number | null;
  location: string | undefined;
}>) {
  return (
    <Cluster
      justify="start"
      gap="lg"
      wrap
      role="group"
      aria-label="Resource ops summary"
    >
      <Inline gap="xs">
        <Value size="xs" tone="default" weight="semibold">
          {total}
        </Value>
        <ReadoutCaption>{total === 1 ? "process" : "processes"}</ReadoutCaption>
      </Inline>
      <Inline gap="xs">
        <Value size="xs" tone="default" weight="semibold">
          {activeCount}
        </Value>
        <ReadoutCaption>active</ReadoutCaption>
      </Inline>
      {netEc !== null && (
        <Inline gap="xs">
          <ReadoutCaption>net EC</ReadoutCaption>
          <Value size="xs" tone="default">
            <Unit
              value={value("units/s", netEc)}
              decimals={rateDecimals(netEc, 2)}
            />
          </Value>
        </Inline>
      )}
      {location && (
        <Inline gap="xs">
          <ReadoutCaption>at</ReadoutCaption>
          <Value size="xs" tone="default">
            {location}
          </Value>
        </Inline>
      )}
    </Cluster>
  );
}

function ResourceOpsComponent(
  _props: Readonly<ComponentProps<ResourceOpsConfig>>,
) {
  const drills = useTelemetry("isru.drills");
  const converters = useTelemetry("isru.converters");

  const allDrills = useMemo(() => drills ?? [], [drills]);
  const allConverters = useMemo(() => converters ?? [], [converters]);
  const anything = allDrills.length + allConverters.length > 0;

  // Drills then converters, read end to end, so one "next" button walks the
  // whole vessel. The index is into this full order, not the currently-shown
  // subset: a hardware walk-through and an active text filter are not usually
  // driven at the same time, and the returned unit name stays correct either way.
  const total = allDrills.length + allConverters.length;
  const [highlighted, setHighlighted] = useState(0);
  const current = total > 0 ? highlighted % total : 0;

  useActionInput<ResourceOpsActions>({
    next: (payload) => {
      // Fire on the press edge only, so one tap steps one unit.
      if (payload.kind === "button" && payload.value !== true) return undefined;
      if (total === 0) return undefined;

      const nextIndex = (current + 1) % total;
      setHighlighted(nextIndex);

      const entry =
        nextIndex < allDrills.length
          ? allDrills[nextIndex]
          : allConverters[nextIndex - allDrills.length];
      return { unit: entry?.partTitle ?? entry?.partId ?? "unknown" };
    },
  });

  const activeCount = useMemo(
    () =>
      allDrills.filter((d) => d.running === true).length +
      allConverters.filter((c) => c.running === true).length,
    [allDrills, allConverters],
  );
  const netEc = useMemo(
    () => netElectricChargeDraw(allConverters),
    [allConverters],
  );

  // Optional, additive vessel/body context (see the class doc's LOCATION
  // note): both reads are `optionalChannels`, so a mount with neither still
  // renders the list untouched, just without this header line.
  const identity = useTelemetry("vessel.identity");
  const systemBodies = useTelemetry("system.bodies");
  const bodyName = useMemo(() => {
    if (identity?.parentBodyIndex == null) return undefined;
    return (systemBodies?.bodies ?? []).find(
      (b) => b.index === identity.parentBodyIndex,
    )?.name;
  }, [identity, systemBodies]);
  const location = identity?.name
    ? bodyName
      ? `${identity.name} · ${bodyName}`
      : identity.name
    : undefined;

  // Index -> name, the same join `bodyName` above performs, shared down to
  // every card's own per-row location caption.
  const bodyNames = useMemo(
    () =>
      new Map(
        (systemBodies?.bodies ?? []).map((b) => [b.index, b.name] as const),
      ),
    [systemBodies],
  );

  // More than one distinct vessel across the two lists flips every card into
  // showing its OWN location: the single header line above would otherwise
  // claim one place for a list that is no longer scoped to just one. Today
  // both channels are still active-vessel-scoped (see the class doc), so this
  // is always false in practice; it activates itself the day a capture widens.
  const showLocation = useMemo(() => {
    const ids = new Set<string>();
    for (const d of allDrills) if (d.vesselId) ids.add(d.vesselId);
    for (const c of allConverters) if (c.vesselId) ids.add(c.vesselId);
    return ids.size > 1;
  }, [allDrills, allConverters]);

  // The row list handed to FilterList. `searchText` is baked from the SHARED
  // fields only (part title, kind, resource names), which is the widget's whole
  // say over searchability: a contributed term (a mod's process title, itself
  // a substring of the shared part title) matches against this without the
  // widget ever reading a provider's extension bag.
  const rows = useMemo<FilterRow[]>(() => {
    const drillRows = allDrills.map((drill, index) => ({
      id: drill.partId ?? `drill-${index}`,
      searchText: `${drill.partTitle ?? drill.partId ?? "Drill"} drill ${
        drill.resource ?? ""
      }`,
      node: (
        <DrillCard
          drill={drill}
          highlighted={index === current}
          showLocation={showLocation}
          bodyNames={bodyNames}
        />
      ),
    }));
    const converterRows = allConverters.map((converter, index) => ({
      id: converter.partId ?? `converter-${index}`,
      searchText: `${
        converter.partTitle ?? converter.partId ?? "Converter"
      } converter ${converterResources(converter)}`,
      node: (
        <ConverterCard
          converter={converter}
          highlighted={allDrills.length + index === current}
          showLocation={showLocation}
          bodyNames={bodyNames}
        />
      ),
    }));
    return [...drillRows, ...converterRows];
  }, [allDrills, allConverters, current, showLocation, bodyNames]);

  if (!anything) {
    return (
      <Panel panelTitle="RESOURCE OPS">
        {/* An empty list is a fact about the vessel, not a missing backend, so
            this says so rather than blaming the connection. */}
        <EmptyState layout="fill">
          No drills or converters on this vessel
        </EmptyState>
      </Panel>
    );
  }

  return (
    <Panel panelTitle="RESOURCE OPS">
      <ResourceOpsStats
        total={total}
        activeCount={activeCount}
        netEc={netEc}
        location={location}
      />
      <ScrollArea>
        <FilterList
          rows={rows}
          emptyLabel="Nothing on this vessel matches the filter"
          rowGap="md"
          chipSize="sm"
        />
      </ScrollArea>
    </Panel>
  );
}

// ── Registration ──────────────────────────────────────────────────────────────

registerComponent<ResourceOpsConfig>({
  id: "resource-ops",
  name: "Resource Ops",
  description:
    "Every drill and chemical converter on the active vessel, grouped into cards: resource, live abundance and extraction rate, deploy and run state, each converter's recipe as an aligned input/output table, and a start/stop toggle. A summary header shows process count, active count, and net EC draw. Renders identically whichever ISRU backend the mod elected.",
  tags: ["telemetry", "resources"],
  defaultSize: { w: 6, h: 8 },
  minSize: { w: 3, h: 4 },
  component: ResourceOpsComponent,
  dataRequirements: ["isru.drills", "isru.converters"],
  // Additive vessel/body context for the header's "at" readout (see the
  // class doc's LOCATION note); the core drill/converter list works fully
  // without either, so these never gate the widget's mount.
  optionalChannels: ["vessel.identity", "system.bodies"],
  defaultConfig: {},
  actions: resourceOpsActions,
  pushable: true,
});

export { ResourceOpsComponent };
