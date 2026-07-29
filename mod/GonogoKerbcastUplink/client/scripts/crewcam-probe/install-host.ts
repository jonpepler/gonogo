/**
 * Installs the sitrep-sdk facade host BEFORE any facade-sealed import runs.
 * MUST be the very first import in crewcam-probe-entry.tsx (ahead of the
 * `@ksp-gonogo/components` / kerbcast client imports): ES import statements
 * are hoisted and their target modules evaluated, in source order, ahead of
 * the importing file's own top-level statements, so an `installTestHost(...)`
 * call sitting inline between later import lines in the SAME file would run
 * too late (every import in that file, however it's interleaved with local
 * code, is hoisted above all of it). Putting the call in its own leaf module
 * and importing that module first is what actually orders it correctly.
 * Mirrors ../probe/probe-install-host.ts's own doc comment and
 * mod/GonogoKerbcastUplink/client/src/test/setup.ts's member list, trimmed to
 * exactly what CrewAvatarGate + KerbcastDataSource call (no CameraFeed /
 * DockingCameraAugment / settings-tab members, since those files are never
 * imported by this probe).
 */
import {
  getGameHost,
  getUplinkHandle,
  PerfBudget,
  registerAugment,
  registerUplinkHandle,
  subscribeSetting,
  useSetting,
} from "@ksp-gonogo/core";
import { logger } from "@ksp-gonogo/logger";
import { installTestHost } from "@ksp-gonogo/sitrep-sdk/testing";

installTestHost({
  createPerfBudget: (opts) => new PerfBudget(opts),
  getGameHost,
  getUplinkHandle,
  logger,
  registerAugment: registerAugment as Parameters<
    typeof installTestHost
  >[0]["registerAugment"],
  registerUplinkHandle: registerUplinkHandle as Parameters<
    typeof installTestHost
  >[0]["registerUplinkHandle"],
  subscribeSetting,
  useSetting,
});
