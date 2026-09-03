/**
 * A thread that was already populated when the page loaded still reveals once
 * the first frame names this session's vantage.
 *
 * This is the ordinary case rather than an edge one. The host thread is
 * restored from `localStorage` in its own constructor, so it is full before
 * anything is rendered, while `useObservedVantage()` is `undefined` until a
 * frame arrives over the socket. So every reload of a screen with a mission's
 * transcript behind it takes this path, and the widget only has to get it
 * wrong once for the whole log to sit under "In transit" with its bodies
 * withheld for the rest of the session.
 *
 * Found by rendering (`packages/app/scripts/render-commcast.ts`): every scene
 * came out with three messages in transit and the delivered ones captioned
 * "lands when the clock is known", on a clock that was correctly anchored.
 */
import { clearRegistry } from "@ksp-gonogo/core";
import { setupStreamFixture } from "@ksp-gonogo/sitrep-sdk/testing";
import { act, render, screen, waitFor } from "@ksp-gonogo/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { CommcastWidget } from "./CommcastComponent";
import { CommcastHostProvider } from "./CommcastHostContext";
import { CommcastHostService } from "./CommcastHostService";
import type { CommsParticipant } from "./types";

const VIEW_UT = 12_000_000;

const FLIGHT: CommsParticipant = {
  stationKey: "ksc-1",
  name: "Kennedy Flight",
  seat: "mission-control",
  vantageId: "ksc",
};

const unmounts: Array<() => void> = [];

afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  clearRegistry();
  localStorage.clear();
});

describe("Commcast, when the vantage arrives after the thread", () => {
  it("reveals a message spoken at this vantage long before the page loaded", async () => {
    const host = new CommcastHostService({ now: () => 0, load: () => [] });
    host.post(FLIGHT, {
      kind: "text",
      body: "Ares, Kennedy. You are go for the insertion burn.",
      sentUt: VIEW_UT - 900,
      oneWaySeconds: 240,
      authorVantageId: "ksc",
    });

    const fixture = setupStreamFixture({
      carriedChannels: ["comms.delay", "commandCentre.separation"],
    });
    const view = render(
      <fixture.Provider>
        <CommcastHostProvider service={host}>
          <CommcastWidget id="w1" config={{}} w={6} h={9} />
        </CommcastHostProvider>
      </fixture.Provider>,
    );
    unmounts.push(view.unmount);

    /*
     * The first frame anchors the clock AND names the vantage. That is the
     * pairing a live socket delivers, and it is the one that moves the
     * reader's seat out from under every reveal instant already computed.
     */
    await waitFor(() =>
      expect(fixture.transport.isSubscribed("comms.delay")).toBe(true),
    );
    await act(async () => {
      fixture.emit(
        "comms.delay",
        { oneWaySeconds: 240 },
        { validAt: VIEW_UT, deliveredAt: VIEW_UT, vantage: "ksc" },
      );
    });

    // Spoken at this very vantage fifteen minutes ago, on a clock that says
    // now is later than that. There is nothing left for it to be crossing.
    await waitFor(() =>
      expect(
        screen.getByText("Ares, Kennedy. You are go for the insertion burn."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/In transit/)).not.toBeInTheDocument();
    await act(async () => {});
  });
});
