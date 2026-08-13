import { registerAugment, useTelemetry } from "@ksp-gonogo/core";
import { ToggleButton } from "@ksp-gonogo/ui";
import {
  Badge,
  Cluster,
  NULL_DISPLAY,
  type Severity,
} from "@ksp-gonogo/ui-kit";
import type { SystemBadgesContext } from "../SystemView";
import {
  setShowCommandTraffic,
  setShowCommlinks,
  useFleetCommsToggles,
} from "./toggles";

/**
 * Fleet/Comms: the first-party augment for `SystemView`'s
 * `system-view.actions`/`system-view.badges` slots
 * (`local_docs/design/specs/2026-07-15-system-view-fleet-comms-design.md`).
 *
 * **The `system-view.overlay` fill (the comms-path line + command-traffic
 * pulse this augment used to draw straight from the diagram origin to the
 * active vessel's own dot) is GONE as of the Task 7 reconciliation.**
 * `SystemView`'s own shape-contribution model superseded it piece by piece:
 * the CommNet relay graph (Task 4, `vesselOrbitsContribution.ts`'s
 * `comms-edge:*` `connection-line` entities), the selected vessel's
 * highlighted route to home (Task 5, `commsPath.ts`), and the pending-command
 * pulses riding that same graph (Task 6, `commsTraffic.ts`). Both drew at
 * once for a while (the live-reported duplicate-pulse bug this reconciliation
 * fixes): the straight line/pulse were a Phase-1 approximation anchored at
 * the diagram origin regardless of actual relay topology (see the class doc
 * this replaced for the "Ground/Vantage anchor simplification" this augment
 * used to carry); the graph-routed version is strictly more honest, so it
 * won, and this augment stopped drawing.
 *
 * What's left, and still does real work:
 * - `.actions`: the Commlinks/Traffic toggle pair. Same module-scoped store
 *   (`./toggles`) as before, but its READERS moved: `SystemView/index.tsx`
 *   now reads it directly to gate the `connection-line` entities /
 *   command-traffic pulses it renders, rather than this augment's own SVG.
 * - `.badges`: the compact link-status pill, reading `comms.link` exactly as
 *   before, untouched by the overlay's removal.
 */

function FleetCommsActions() {
  const { showCommlinks, showCommandTraffic } = useFleetCommsToggles();
  return (
    <Cluster justify="start" gap="xs">
      <ToggleButton
        type="button"
        size="sm"
        active={showCommlinks}
        title="Show commlinks"
        onClick={() => setShowCommlinks(!showCommlinks)}
      >
        Commlinks
      </ToggleButton>
      <ToggleButton
        type="button"
        size="sm"
        active={showCommandTraffic}
        title="Show command traffic"
        onClick={() => setShowCommandTraffic(!showCommandTraffic)}
      >
        Traffic
      </ToggleButton>
    </Cluster>
  );
}

/**
 * `system-view.badges`: a compact link-status indicator, the design doc's
 * "comms/link status indicator" fill this augment always intended (see this
 * file's class doc). Reads `comms.link`, the same topic the selected-path
 * highlight's colour derives from (`commsControlQuality`, `commsPath.ts`), so
 * the header badge and the diagram never disagree about link state.
 *
 * Three states, never collapsed into each other: `connected` (a real link
 * home right now), `no link` (a real, confirmed absence: a genuine ops
 * fact), and `NULL_DISPLAY` (`comms.link` has never delivered a sample: no
 * Uplink mounted, or nothing received yet: an honest "unknown", not a
 * fabricated "no link"). Ignores `frameName`: link state isn't a function of
 * which body the diagram is framed on.
 */
function FleetCommsBadge(_props: Readonly<SystemBadgesContext>) {
  const link = useTelemetry("comms.link");
  const connected = link?.connected ?? null;
  // `Badge` (ui-kit): the codebase's one canonical state-pill, already
  // carrying the vetted go/nogo/neutral fg-on-bg contrast pairing, so this
  // badge composes it rather than hand-rolling a styled dot (the widget
  // library's own convention: no bespoke CSS where a ui-kit primitive
  // already fits, see local_docs/telemetry-mod/ui-kit-design.md). The label
  // text IS the accessible name; no `aria-label` needed on top of it.
  const severity: Severity | undefined =
    connected === true
      ? "nominal"
      : connected === false
        ? "critical"
        : undefined;
  const label =
    connected === true ? "LINK" : connected === false ? "NO LINK" : null;
  // `data-testid`: the label text alone isn't a safe query target for the
  // unknown state (`NULL_DISPLAY`, the shared null-placeholder glyph, also
  // appears elsewhere in the diagram/almanac), so tests scope to this
  // instead of risking an ambiguous `getByText` match, per the KCD
  // role>label>text>testid fallback order.
  return (
    <Badge severity={severity} data-testid="fleet-comms-badge">
      {label ?? NULL_DISPLAY}
    </Badge>
  );
}

registerAugment({
  id: "fleet-comms-actions",
  augments: "system-view.actions",
  component: FleetCommsActions,
});

registerAugment({
  id: "fleet-comms-badge",
  augments: "system-view.badges",
  component: FleetCommsBadge,
  channels: ["comms.link"],
});

export { FleetCommsActions, FleetCommsBadge };
