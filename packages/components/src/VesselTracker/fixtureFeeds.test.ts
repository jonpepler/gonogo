import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A probe fixture that emits a topic nothing is subscribed to renders exactly
 * like a fixture that emits nothing at all: no error, no warning, a perfectly
 * plausible screenshot of the empty state, which the visual gate then adopts as
 * the baseline for a feature it never rendered.
 *
 * <p>This widget rides two dynamic namespaces (`fleet.` and `silence.`), and a
 * dynamic namespace is carried by its PREFIX, not by the concrete per-guid
 * topic. Naming `fleet.mun-probe.contact` in `carriedChannels` would leave the
 * subscription non-existent and every contact assertion silently unrendered.
 * SystemView's contact fixtures were bitten by exactly this.</p>
 */
describe("VesselTracker probe fixtures", () => {
  const dir = join(__dirname, "__fixtures__");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

  it("has fixtures to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s carries every channel it emits", (file) => {
    const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      _stream?: { carriedChannels?: string[]; emits?: { channel: string }[] };
    };
    const stream = fixture._stream;
    if (!stream?.emits) return;

    const carried = stream.carriedChannels ?? [];
    const uncovered = stream.emits
      .map((e) => e.channel)
      .filter(
        (channel) =>
          !carried.some(
            (c) => c === channel || (c.endsWith(".") && channel.startsWith(c)),
          ),
      );

    expect(uncovered).toEqual([]);
  });

  /**
   * The prefix check above only proves an emit COULD be delivered. This proves
   * the fixtures actually exercise the per-vessel topics at all: a set that
   * quietly lost its `silence.` emits would still pass everything else while
   * rendering the same "no silence model" screen five times over.
   */
  it("exercises both per-vessel namespaces across the set", () => {
    const channels = files.flatMap((file) => {
      const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        _stream?: { emits?: { channel: string }[] };
      };
      return (fixture._stream?.emits ?? []).map((e) => e.channel);
    });
    expect(channels.some((c) => c.startsWith("fleet."))).toBe(true);
    expect(channels.some((c) => c.startsWith("silence."))).toBe(true);
  });

  it("tracks a craft that is not the one being flown", () => {
    // The widget's whole subject is a craft you cannot see. A fixture set whose
    // tracked vessel is also the active one would render a state the widget is
    // not really for, and would pass without ever proving the picker works.
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        _stream?: {
          emits?: { channel: string; value: { vesselId?: string } }[];
        };
      };
      const emits = fixture._stream?.emits ?? [];
      const active = emits.find((e) => e.channel === "vessel.identity")?.value
        .vesselId;
      const tracked = emits
        .map((e) =>
          /^(?:fleet|silence)\.(.+)\.(?:contact|state)$/.exec(e.channel),
        )
        .find(Boolean)?.[1];
      expect(tracked, `${file} emits no per-vessel topic`).toBeTruthy();
      expect(tracked, `${file} tracks the active craft`).not.toBe(active);
    }
  });
});
