import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsoleLogger } from "./index";
import { tagRegistry } from "./tags";

describe("ConsoleLogger tag gating", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    tagRegistry.clearOverride();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    tagRegistry.clearOverride();
  });

  it("suppresses tagged debug when the tag is not enabled", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    tagRegistry.setTags([]);
    logger.tag("peer").debug("hello");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("emits tagged debug when the tag is enabled", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    tagRegistry.setTags(["peer"]);
    logger.tag("peer").debug("hello");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("wildcard '*' enables every tag", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    tagRegistry.setTags("all");
    logger.tag("anything").debug("hello");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("colon-scoped tags inherit from their base tag", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    tagRegistry.setTags(["peer"]);
    logger.tag("peer:kos").debug("nested");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("always emits warn/error regardless of tag gating", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    tagRegistry.setTags([]);
    logger.tag("peer").warn("wat");
    logger.tag("peer").error("boom");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("does not buffer tag-gated debug entries that were suppressed", () => {
    const logger = new ConsoleLogger({ enabled: true, level: "debug" });
    tagRegistry.setTags([]);
    logger.tag("peer").debug("hidden");
    expect(consoleSpy).not.toHaveBeenCalled();
    expect(logger.getBuffer().length).toBe(0);
  });

  it("ring buffer retains emitted entries for export", () => {
    const logger = new ConsoleLogger({
      enabled: true,
      level: "debug",
      bufferCapacity: 3,
    });
    logger.info("one");
    logger.info("two");
    logger.info("three");
    logger.info("four");
    const dump = JSON.parse(logger.exportLogs()) as Array<{ message: string }>;
    expect(dump).toHaveLength(3);
    expect(dump[0].message).toBe("two");
    expect(dump[2].message).toBe("four");
  });
});
