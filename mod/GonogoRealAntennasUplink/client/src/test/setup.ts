import {
  defineUplinkClient,
  installDomStubs,
  PerfBudget,
  useTelemetry,
} from "@ksp-gonogo/core";
import { installTestHost } from "@ksp-gonogo/sitrep-sdk/testing";
import { setQuantityLocale } from "@ksp-gonogo/ui-kit";

installDomStubs();

// Soft-cap regression gate: any test that pushes a registered PerfBudget over
// its threshold fails. See PerfBudget.installTestGate for opt-out.
PerfBudget.installTestGate();

// Bridge the sitrep-sdk facade's fail-loud shims to the SAME real core
// singletons this suite exercises: mirrors buildGonogoHost() member-for-member,
// scoped to the subset this client actually calls.
//
// The subset is `useTelemetry` (the hydration test decodes a frame through the
// real pipeline via the facade) plus `defineUplinkClient`: this client now
// registers the `comm-signal.hop-rates` contribution through a REALANTENNAS
// handle at module load (uplink.ts), so any test importing that module needs the
// host to resolve the handle factory. It still registers no component, so there
// is no registerComponent to bridge.
installTestHost({
  useTelemetry,
  defineUplinkClient,
});

// Pin the locale every quantity is written in. It defaults to the READER's
// locale, which is right for an operator and wrong for a snapshot: a render on
// a French machine has to match one on an American CI runner.
setQuantityLocale("en-GB");
