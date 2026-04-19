import type { ComponentProps } from "@gonogo/core";
import { getDataSource, registerComponent, useKosProxy } from "@gonogo/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import styled from "styled-components";
import "@xterm/xterm/css/xterm.css";

interface KosTerminalConfig {
  proxyHost?: string;
  proxyPort?: number;
  kosHost?: string;
  kosPort?: number;
  /** When true, keystrokes are not forwarded to the PTY. */
  readOnly?: boolean;
  /**
   * Tagname of the CPU to auto-select when the kOS connection menu appears
   * (the inner part of the "(partType(tagname))" entry in the menu).
   * If omitted, the menu is presented interactively.
   */
  cpuName?: string;
}

// Matches a CPU row: " [1]   no    0     Vessel Name (KAL9000(tagname))"
// Groups: 1=number, 2=vesselName, 3=partType, 4=tagname
const CPU_ROW_RE = /\[(\d+)\]\s+\S+\s+\d+\s+(.+?)\s+\(([^(]+)\(([^)]+)\)\)/;
const LIST_CHANGED = "--(List of CPU's has Changed)--";
const MENU_HEADER = "Vessel Name (CPU tagname)";
const GARBLED_INPUT = "Garbled selection. Try again.";

/**
 * Fixed PTY width. We never send a width change to the proxy — width
 * changes during the kOS CPU menu (the most fragile moment in the
 * terminal's lifecycle) re-paint the menu and garble it, breaking both
 * the auto-select parser and manual readability. A comfortably wide
 * value dodges every line-wrap problem kOS can throw at us; the
 * in-widget xterm viewport is a window onto this wider PTY and clips
 * content that doesn't fit. Users break long commands with newlines
 * naturally, so it's rarely noticed in practice.
 */
const PTY_COLS = 80;
const MIN_REASONABLE_ROWS = 3;

function getKosDefaults() {
  const kos = getDataSource("kos");
  if (!kos) return { kosHost: "localhost", kosPort: 5410 };
  const c = kos.getConfig();
  return {
    kosHost: typeof c.kosHost === "string" ? c.kosHost : "localhost",
    kosPort: typeof c.kosPort === "number" ? c.kosPort : 5410,
  };
}

function KosTerminalComponent({ config }: ComponentProps<KosTerminalConfig>) {
  const { createConnection, resize } = useKosProxy();
  const defaults = getKosDefaults();
  const kosHost = config?.kosHost ?? defaults.kosHost;
  const kosPort = config?.kosPort ?? defaults.kosPort;
  const readOnly = config?.readOnly ?? false;
  const cpuName = config?.cpuName;

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Session ID is stable for the lifetime of this effect instance
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sessionId = sessionIdRef.current;
    let teardown: (() => void) | null = null;
    let cancelled = false;
    let sizeWaiter: ResizeObserver | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    function runSetup() {
      if (cancelled || teardown || !container) return;
      sizeWaiter?.disconnect();
      sizeWaiter = null;
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }

      const term = new Terminal({
        theme: {
          background: "#0d0d0d",
          foreground: "#cccccc",
          cursor: "#00ff88",
          selectionBackground: "#2a4a2a",
        },
        fontFamily: "monospace",
        fontSize: 13,
        cursorBlink: !readOnly,
      });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(container);

      // Fix the PTY width at PTY_COLS; only the row count tracks the
      // container. We use proposeDimensions() rather than fit() so the
      // first resize() call lands directly at (PTY_COLS, rows) — otherwise
      // fit() would resize to (proposedCols, rows) first, then we'd have
      // to correct to (PTY_COLS, rows), firing onResize twice.
      const proposed = fitAddon.proposeDimensions();
      const initialRows =
        proposed && proposed.rows >= MIN_REASONABLE_ROWS ? proposed.rows : 24;
      term.resize(PTY_COLS, initialRows);
      termRef.current = term;

      if (readOnly) {
        term.writeln("\x1b[2m[read-only]\x1b[0m");
      }

      // CPU auto-selection state — reset per effect instance
      let menuBuffer = "";
      let inMenuSelection = cpuName !== undefined;

      const ws = createConnection({
        sessionId,
        kosHost,
        kosPort,
        cols: PTY_COLS,
        rows: initialRows,
      });
      wsRef.current = ws as unknown as WebSocket;

      ws.addEventListener("open", () => {
        term.writeln("\x1b[32mConnected to kOS proxy\x1b[0m");
      });

      ws.addEventListener("message", ({ data }) => {
        const text = typeof data === "string" ? data : String(data);
        term.write(text);

        if (cpuName !== undefined) {
          // Garbled input: reset so we auto-select on the next menu appearance
          if (text.includes(GARBLED_INPUT)) {
            inMenuSelection = true;
            menuBuffer = "";
          }

          if (inMenuSelection) {
            if (text.includes(LIST_CHANGED)) menuBuffer = "";
            menuBuffer += text;

            if (menuBuffer.includes(MENU_HEADER)) {
              for (const line of menuBuffer.split("\n")) {
                const m = CPU_ROW_RE.exec(line);
                if (m && m[4] === cpuName) {
                  if (ws.readyState === WebSocket.OPEN) ws.send(`${m[1]}\n`);
                  inMenuSelection = false;
                  menuBuffer = "";
                  break;
                }
              }
            }
          }
        }
      });

      ws.addEventListener("close", () => {
        term.writeln("\r\n\x1b[33m[connection closed]\x1b[0m");
      });

      ws.addEventListener("error", () => {
        term.writeln("\r\n\x1b[31m[connection error]\x1b[0m");
      });

      // Terminal keystrokes → PTY (character-by-character, no buffering)
      if (!readOnly) {
        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        });
      }

      // Resize events → proxy (or PeerJS tunnel on stations). We always
      // send PTY_COLS for the width — the PTY width is immutable.
      term.onResize(({ rows }) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        resize(sessionId, PTY_COLS, rows);
      });

      // Only the container's HEIGHT drives rows. Width stays pinned at
      // PTY_COLS, so horizontal container changes never trigger a NAWS
      // exchange that could interrupt menu rendering.
      const observer = new ResizeObserver(() => {
        const next = fitAddon.proposeDimensions();
        if (
          next &&
          next.rows >= MIN_REASONABLE_ROWS &&
          next.rows !== term.rows
        ) {
          term.resize(PTY_COLS, next.rows);
        }
      });
      observer.observe(container);

      teardown = () => {
        observer.disconnect();
        ws.close();
        term.dispose();
        wsRef.current = null;
        termRef.current = null;
      };
    }

    // Defer setup until the container has real layout dimensions. If we ran
    // immediately under react-grid-layout's 0×0 first paint, fit() would
    // return xterm's 2-column minimum; later when RGL sizes the cell we'd
    // fire an onResize that re-paints kOS and garbles the menu. Waiting
    // here means the PTY spawns at the correct size and the very next
    // onResize we send matches — kOS never sees a size change during the
    // initial menu exchange.
    const ready = () =>
      container.clientWidth >= 10 && container.clientHeight >= 10;

    if (ready()) {
      runSetup();
    } else {
      sizeWaiter = new ResizeObserver((entries) => {
        const entry = entries[0];
        const haveContentRect =
          entry &&
          entry.contentRect.width >= 10 &&
          entry.contentRect.height >= 10;
        if (haveContentRect || ready()) runSetup();
      });
      sizeWaiter.observe(container);
      // Safety net: if we somehow never observe a real size (mocked RO in
      // tests, container genuinely stays invisible), proceed anyway with
      // the default fallback dimensions baked into runSetup.
      fallbackTimer = setTimeout(runSetup, 500);
    }

    return () => {
      cancelled = true;
      sizeWaiter?.disconnect();
      if (fallbackTimer !== null) clearTimeout(fallbackTimer);
      teardown?.();
    };
    // Config values are primitives — re-run the effect if any change
  }, [createConnection, resize, kosHost, kosPort, readOnly, cpuName]);

  return <Container ref={containerRef} $readOnly={readOnly} />;
}

registerComponent<KosTerminalConfig>({
  id: "kos-terminal",
  name: "kOS Terminal",
  description:
    "Interactive or read-only terminal connected to a kOS CPU via the telnet proxy.",
  tags: ["kos", "control", "telemetry"],
  defaultSize: { w: 18, h: 15 },
  openConfigOnAdd: true,
  component: KosTerminalComponent,
  dataRequirements: [],
  behaviors: [],
  defaultConfig: {
    proxyHost: "localhost",
    proxyPort: 3001,
    kosHost: "localhost",
    kosPort: 5410,
  },
});

export { KosTerminalComponent };

const Container = styled.div<{ $readOnly?: boolean }>`
  width: 100%;
  height: 100%;
  background: #0d0d0d;
  border: 1px solid ${({ $readOnly }) => ($readOnly ? "#1a1a2e" : "#2a2a2a")};
  border-radius: 4px;
  overflow: hidden;
  box-sizing: border-box;

  /* xterm.js mounts a child div — make it fill the container */
  .xterm {
    height: 100%;
    padding: 8px;
  }
  .xterm-viewport {
    border-radius: 4px;
  }
`;
