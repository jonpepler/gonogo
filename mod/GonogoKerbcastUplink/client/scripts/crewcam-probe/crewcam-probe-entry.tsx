/**
 * THROWAWAY manual-review probe: CrewManifest with the kerbcast crew
 * face-camera avatar slot actually filled, for a one-off operator screenshot.
 * NOT the shared visual-gate probe (`../probe/probe-entry.tsx`) and not wired
 * into it: importing the kerbcast Uplink client into the shared entry would
 * change what every OTHER widget's gate render depends on, so this lives in
 * its own tiny bundle instead. See render-crewcam.ts for the driver.
 *
 * Recipe, borrowed from two existing precedents rather than invented fresh:
 *  - mod/GonogoKerbcastUplink/client/scripts/probe/probe-entry.tsx (real
 *    KerbcastDataSource + a canvas.captureStream() MediaStreamTrack delivered
 *    through a mock transport: the "give the <video> genuine pixels" route).
 *  - mod/GonogoKerbcastUplink/client/src/CrewAvatarGate/index.test.tsx (the
 *    SDK's own MockSidecar, dynamic-mode subscribe -> slot -> track, which is
 *    the correlation path selectKerbalCamera/CrewAvatarGate actually uses,
 *    unlike the legacy MockKerbcastSession the CameraFeed probe above uses).
 */
// MUST be the first import (see that module's doc comment for why): it
// installs the sitrep-sdk facade host before any facade-sealed import below
// (the kerbcast client, and transitively `@ksp-gonogo/components`) evaluates.
import "./install-host";
// This throwaway probe renders CrewManifestComponent directly (not through
// getComponent(widgetId) the way the shared gate probe does), so it pulls
// from the package's real public surface rather than importing components'
// internal src/ tree cross-package (this file lives in the kerbcast client
// package, not inside packages/components).
import {
  AlarmsLauncherProvider,
  CrewManifestComponent,
} from "@ksp-gonogo/components";
import {
  DashboardItemContext,
  registerUplinkHandle,
  SettingsProvider,
  SettingsService,
} from "@ksp-gonogo/core";
import { CameraKind, CrewLocation } from "@ksp-gonogo/kerbcast";
import { MockSidecar } from "@ksp-gonogo/kerbcast/testing";
import {
  createFakeWallClock,
  StubTransport,
  spaceCenterStateChannel,
  TelemetryClient,
  TelemetryProvider,
  TimelineStore,
  ViewClock,
  vesselStateChannel,
} from "@ksp-gonogo/sitrep-client";
import { ModalProvider } from "@ksp-gonogo/ui";
import { defaultDarkTheme } from "@ksp-gonogo/ui-kit";
import { createElement, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
// The kerbcast Uplink client's own local source (this package IS the
// kerbcast Uplink client, so this is a normal same-package relative import,
// not a cross-package reach). registerAugment("kerbcast-crew-avatar" ->
// "crew-manifest.avatar") happens as CrewAvatarGate's import side effect.
import { KerbcastDataSource } from "../../src/KerbcastDataSource";
import "../../src/CrewAvatarGate";

// Benign artifact of this harness rendering more than one grid-size mode
// against the SAME live <video>: unmounting between modes can abort an
// in-flight autoplay play() request (real HTMLMediaElement behaviour, not a
// widget bug), which the browser reports as an unhandled rejection. The
// driver treats any page error as fatal (rightly, for a real bug), so
// swallow exactly this known, expected one rather than loosening that check
// harness-wide.
window.addEventListener("unhandledrejection", (e) => {
  if (String(e.reason).includes("interrupted by a new load request")) {
    e.preventDefault();
  }
});

/**
 * Trimmed local copy of packages/components/src/test/setupStreamFixture.tsx
 * (a components-package-internal test helper, not part of its public dist
 * surface, so not importable from here): the same "real TelemetryProvider +
 * StubTransport, subscription-gated emit" stream test-adapter CrewManifest's
 * own headless tests and the shared render harness use, scoped to exactly
 * what this probe needs (no delaySeconds knob).
 */
function setupStreamFixture(opts: {
  carriedChannels: Iterable<string>;
  pinnedUt?: number;
}): {
  Provider: (props: { children: ReactNode }) => ReactElement;
  emit: (
    topic: string,
    payload: unknown,
    metaOverrides?: Record<string, unknown>,
  ) => void;
  isSubscribed: (topic: string) => boolean;
} {
  const wall = createFakeWallClock();
  const transport = new StubTransport();
  const client = new TelemetryClient(transport);
  const clock = new ViewClock({
    nowWall: wall.now,
    warpRate: () => 1,
    delaySeconds: () => 0,
  });
  const store = new TimelineStore(clock);
  store.registerDerivedChannel(vesselStateChannel);
  store.registerDerivedChannel(spaceCenterStateChannel);
  if (opts.pinnedUt !== undefined) clock.scrubTo(opts.pinnedUt);

  const carriedChannels = opts.carriedChannels;

  function Provider({ children }: { children: ReactNode }) {
    return createElement(
      TelemetryProvider,
      { client, store, carriedChannels },
      children,
    );
  }

  return {
    Provider,
    emit: (topic, payload, metaOverrides) =>
      transport.emit(topic, payload, metaOverrides),
    isSubscribed: (topic) => transport.isSubscribed(topic),
  };
}

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    length: m.size,
    clear: () => m.clear(),
    key: () => null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  } as Storage;
}

export interface CrewcamPayload {
  w: number;
  h: number;
  pxW: number;
  pxH: number;
}

let root: Root | null = null;

/**
 * Paint a distinguishable per-kerbal "face" into a 2D context: a solid hue
 * plus the kerbal's initials, with a slowly orbiting dot so a captured frame
 * reads as live video rather than a static card. Used as the source for each
 * kerbal's canvas.captureStream() track.
 */
function paintFace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  hue: number,
  initials: string,
  t: number,
): void {
  ctx.fillStyle = `hsl(${hue} 55% 22%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `hsl(${hue} 70% 62%)`;
  ctx.font = `${Math.round(h * 0.4)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials, w / 2, h / 2);
  const cx = w / 2 + Math.cos(t) * w * 0.32;
  const cy = h / 2 + Math.sin(t) * h * 0.32;
  ctx.fillStyle = `hsl(${(hue + 120) % 360} 80% 70%)`;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(3, w * 0.04), 0, Math.PI * 2);
  ctx.fill();
}

/** Live canvas.captureStream() track for one kerbal, real pixels (not a
 *  fake/stub MediaStream): only possible because this runs in real
 *  Chromium, not jsdom. */
function startFaceStream(hue: number, initials: string): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  // Off-screen but still attached to the document: some engines throttle or
  // never advance rAF for a canvas that was never inserted into the DOM.
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:0;width:256px;height:256px;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  let t = 0;
  const draw = (): void => {
    t += 0.03;
    paintFace(ctx, 256, 256, hue, initials, t);
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(30);
}

async function setupKerbcast(): Promise<void> {
  const sidecar = new MockSidecar();

  // Two face streams: distinguishable colour + initials per kerbal, matching
  // the two crew rows that will actually correlate to a kerbcast camera. Bob
  // Kerman (third roster row, no camera) deliberately gets none, to show the
  // bullet fallback still degrades gracefully alongside two live avatars.
  const jebTrack = startFaceStream(28, "JK").getVideoTracks()[0];
  const valTrack = startFaceStream(200, "VK").getVideoTracks()[0];
  const trackByFlight = new Map<number, MediaStreamTrack>([
    [101, jebTrack],
    [102, valTrack],
  ]);
  sidecar.onSubscribe((flightId, mid) => {
    const track = trackByFlight.get(flightId);
    if (track) sidecar.deliverTrack(mid, track);
  });

  // Same two-call fetch shape KerbcastDataSource.connect() makes: /ice-config
  // (TURN creds, none here) then the SDK's own POST /offer negotiate.
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/ice-config")) {
      return new Response(JSON.stringify({ iceServers: [] }), {
        status: 200,
      });
    }
    return MockSidecar.makeOfferResponse([]);
  }) as typeof fetch;

  const ds = new KerbcastDataSource({ port: 1 }, sidecar.createTransport());
  registerUplinkHandle("kerbcast", ds);

  await ds.connect();
  sidecar.open();
  sidecar.setConnectionState("connected");
  sidecar.setCameras([
    {
      flightId: 101,
      kind: CameraKind.Kerbal,
      cameraName: "Jebediah Kerman",
      crewLocation: CrewLocation.Seat,
    },
    {
      flightId: 102,
      kind: CameraKind.Kerbal,
      cameraName: "Valentina Kerman",
      crewLocation: CrewLocation.Eva,
    },
  ]);
}

const settingsService = new SettingsService(memoryStorage());
settingsService.set("kerbcast.embeddedFacecams", true);

// vessel.crew / vessel.identity / vessel.orbit (CrewManifest's own reads) +
// kerbcast.available (the augment's Domain presence gate, AugmentSlot's
// `useAugmentAvailable`) all ride the canonical Topic stream: same
// `setupStreamFixture` test-adapter the widgets' own headless tests and the
// shared render harness use, see CrewManifest/__fixtures__/valentina-solo-
// orbit.json's `_stream` block for the precedent this mirrors.
const stream = setupStreamFixture({
  carriedChannels: [
    "vessel.crew",
    "vessel.identity",
    "vessel.orbit",
    "kerbcast.available",
  ],
  pinnedUt: 0,
});

let kerbcastReady: Promise<void> | null = null;

async function renderCrewcam(payload: CrewcamPayload): Promise<void> {
  if (!kerbcastReady) kerbcastReady = setupKerbcast();
  await kerbcastReady;

  const el = document.getElementById("root");
  if (!el) throw new Error("crewcam probe: #root missing");
  el.style.width = `${payload.pxW}px`;
  el.style.height = `${payload.pxH}px`;
  el.style.overflow = "hidden";
  el.style.background = "var(--color-surface-app)";

  if (root) {
    root.unmount();
    root = null;
  }

  root = createRoot(el);
  root.render(
    createElement(
      ThemeProvider,
      { theme: defaultDarkTheme },
      createElement(
        stream.Provider,
        null,
        createElement(
          SettingsProvider,
          { service: settingsService },
          createElement(
            ModalProvider,
            null,
            createElement(
              AlarmsLauncherProvider,
              {
                launcher: () => {},
                creator: () => {},
                manager: { find: () => null, remove: () => {} },
              },
              createElement(
                DashboardItemContext.Provider,
                { value: { instanceId: "crewcam-probe" } },
                createElement(CrewManifestComponent, {
                  config: {},
                  id: "crewcam-probe",
                  w: payload.w,
                  h: payload.h,
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  await rafTick();

  // Each emit waits for its own topic's subscription to land first (the
  // widget subscribes inside a passive effect; see waitForSubscription's doc
  // comment), then a settling rafTick so the resulting re-render commits
  // before the next wait.
  //
  // ORDER MATTERS here beyond the usual subscribe race: the crew-avatar
  // augment's <AugmentSlot> only exists once CrewManifest has actually
  // rendered a roster row for each kerbal (it's nested inside the
  // `names.map(...)` loop), and a roster row only exists once `vessel.crew`
  // has landed. So `kerbcast.available` MUST be emitted LAST: emitting it
  // first (before any row -> before any augment subscribes to it) means
  // `waitForSubscription` finds nothing yet, times out, and the emit is
  // dropped exactly like an unsubscribed-topic emit always is, with no
  // second chance since this fixture only fires each topic once.
  await waitForSubscription(stream, "vessel.crew");
  stream.emit("vessel.crew", {
    count: 3,
    capacity: 4,
    crew: [
      { name: "Jebediah Kerman", trait: "Pilot" },
      { name: "Valentina Kerman", trait: "Pilot" },
      { name: "Bob Kerman", trait: "Engineer" },
    ],
  });
  await rafTick();

  await waitForSubscription(stream, "vessel.identity");
  stream.emit("vessel.identity", {
    vesselId: "tester-1",
    name: "Munar Base One",
    vesselType: 0,
    situation: 3,
    parentBodyIndex: 0,
  });
  await rafTick();

  await waitForSubscription(stream, "vessel.orbit");
  stream.emit("vessel.orbit", {
    referenceBodyIndex: 0,
    sma: 687100,
    ecc: 0.001,
    inc: 0,
    argPe: 0,
    mu: 3.5316e12,
    meanAnomalyAtEpoch: 0,
    epoch: 0,
  });
  await rafTick();

  await waitForSubscription(stream, "kerbcast.available");
  stream.emit(
    "kerbcast.available",
    true,
    // quality: 1 == Quality.Loaded (see slot.test.tsx / the fixture-JSON
    // convention: quality: 1 in every `_stream` emit's meta).
    { quality: 1, source: "kerbcast" },
  );
  await rafTick();
  await rafTick();
  await rafTick();
  // Let the augment's own effects (subscribeCamera -> ds.connect chain is
  // already settled; this is the React commit for the stream -> media
  // subscribe -> <video> srcObject assignment) and the captureStream tracks
  // land a few real frames before the screenshot.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

function rafTick(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * `StubTransport.emit` is subscription-gated: it silently drops a sample for
 * a topic nothing has subscribed to yet. The widget subscribes inside a React
 * passive effect, which a single `rafTick` doesn't reliably outlast (same
 * flake the shared probe harness's own `waitForSubscription` documents and
 * fixes for the exact same reason). Poll instead of guessing a fixed delay.
 */
async function waitForSubscription(
  transport: { isSubscribed(topic: string): boolean },
  topic: string,
  maxFrames = 30,
): Promise<void> {
  for (let i = 0; i < maxFrames; i++) {
    if (transport.isSubscribed(topic)) return;
    await rafTick();
  }
}

declare global {
  interface Window {
    __renderCrewcam: (payload: CrewcamPayload) => Promise<void>;
  }
}

window.__renderCrewcam = renderCrewcam;
