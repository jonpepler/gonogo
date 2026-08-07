/**
 * Standalone probe for the Panel delay rail (`Panel.Delay` / PanelDelayRail).
 *
 * The dashboard's own visual-gate probe wraps a widget only in
 * AlarmsLauncherProvider + DashboardItemContext, with NO DelayRailProvider, so
 * `usePanelDelay` no-ops and the delay rail never draws in CI. This probe
 * closes that gap: it mounts a real `<DelayRailProvider>` above a `<Panel>`
 * whose body contributes a hand-built `CommandDelayHandle` through
 * `usePanelDelay` (exactly the GridItemContent -> widget-body relationship, and
 * the `Panel.delay.test.tsx` pattern), so `InFlightList` / `ControlDelayStream`
 * / the rail chrome render for a screenshot. Scenarios are supplied by the
 * `render-delay-rail` driver; nothing here is fixture-file-bound.
 */
import {
  type CommandDelayHandle,
  DelayRailProvider,
  Panel,
  usePanelDelay,
} from "@ksp-gonogo/ui-kit";
import { createRoot, type Root } from "react-dom/client";

interface DelayRailProbePayload {
  /** The command handle the widget body contributes to the rail. */
  handle: CommandDelayHandle;
  /** Panel title, so the rail is shown in real header context. */
  panelTitle: string;
  pxW: number;
  pxH: number;
}

let activeRoot: Root | null = null;

/**
 * A command widget's body: hands its delay handle to the rail via
 * `usePanelDelay`, the same way a real widget hands `useCommand(...)`'s handle
 * across. No explicit prop to the rail.
 */
function CommandBody({ handle }: { handle: CommandDelayHandle }) {
  usePanelDelay(handle);
  return (
    <div
      style={{
        padding: "var(--space-8, 8px)",
        minHeight: 140,
        color: "var(--color-text-muted)",
        fontSize: "var(--font-size-sm)",
      }}
    >
      widget body
    </div>
  );
}

function Harness({
  handle,
  panelTitle,
}: {
  handle: CommandDelayHandle;
  panelTitle: string;
}) {
  return (
    <DelayRailProvider>
      <Panel panelTitle={panelTitle}>
        <CommandBody handle={handle} />
      </Panel>
    </DelayRailProvider>
  );
}

async function renderDelayRail(payload: DelayRailProbePayload): Promise<void> {
  const root = document.getElementById("root");
  if (!root) throw new Error("Delay-rail probe: #root missing");
  if (activeRoot) {
    activeRoot.unmount();
    activeRoot = null;
  }
  root.style.width = `${payload.pxW}px`;
  root.style.height = `${payload.pxH}px`;
  root.style.background = "var(--color-surface-panel)";
  root.innerHTML = "";
  activeRoot = createRoot(root);
  activeRoot.render(
    <Harness handle={payload.handle} panelTitle={payload.panelTitle} />,
  );
  // Settle past a raf or two so the rail measures its height and any
  // canvas indicators paint before the screenshot.
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  await new Promise<void>((r) => setTimeout(r, 400));
}

declare global {
  interface Window {
    __renderDelayRail: (payload: DelayRailProbePayload) => Promise<void>;
  }
}

window.__renderDelayRail = renderDelayRail;

export type { DelayRailProbePayload };
