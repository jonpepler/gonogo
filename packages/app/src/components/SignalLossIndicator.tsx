import { useDataValue } from "@gonogo/core";
import { SignalLossBanner, type SignalState } from "@gonogo/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Wires `SignalLossBanner` to the live CommNet state from the `"data"` source.
 *
 * Signal state is derived from:
 *  - `comm.connected` — is there a link to KSC at all?
 *  - `comm.controlState` — 0 no control, 1 partial, 2 full.
 *
 * Until Telemachus reports `comm.connected` (warmup, or no vessel active)
 * we stay in the "connected" state so the banner stays hidden — the banner
 * is for genuine blackouts, not absence of data.
 *
 * Elapsed time is measured from the moment the state last left "connected".
 * A 1s interval ticks a render to keep the timer label fresh.
 */
export function SignalLossIndicator() {
  const connected = useDataValue("data", "comm.connected");
  const controlState = useDataValue("data", "comm.controlState");

  const state = deriveState(connected, controlState);

  const lostSinceRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Reset the "since" timestamp whenever we cross in/out of "connected".
  useEffect(() => {
    if (state === "connected") {
      lostSinceRef.current = null;
    } else if (lostSinceRef.current === null) {
      lostSinceRef.current = Date.now();
    }
  }, [state]);

  // Periodic re-render for the timer label. Only while a banner is visible —
  // no point ticking when we're healthy.
  useEffect(() => {
    if (state === "connected") return;
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [state]);

  const elapsedMs =
    lostSinceRef.current === null ? 0 : Math.max(0, now - lostSinceRef.current);

  return <SignalLossBanner state={state} elapsedMs={elapsedMs} />;
}

/**
 * "Lost" is deliberately bound to `comm.connected === false` only — the same
 * condition that triggers `BufferedDataSource`'s signal-loss gate. This keeps
 * the banner honest: when it says SIGNAL LOSS, telemetry really has stopped
 * flowing. `controlState` low without disconnection (crewed ship missing its
 * pilot etc.) is informational only and shown as PARTIAL.
 */
export function deriveState(
  connected: boolean | undefined,
  controlState: number | undefined,
): SignalState {
  // Haven't heard from Telemachus yet — treat as connected (banner hidden).
  // Any true blackout will land a `comm.connected: false` via the always-
  // exempt gating path.
  if (connected === undefined && controlState === undefined) return "connected";

  if (connected === false) return "lost";
  if (controlState === 0 || controlState === 1) return "partial";
  return "connected";
}
