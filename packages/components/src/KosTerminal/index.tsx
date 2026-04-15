import type { ComponentProps } from "@gonogo/core";
import { getDataSource, registerComponent } from "@gonogo/core";
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

function getKosDefaults() {
  const kos = getDataSource("kos");
  if (!kos)
    return {
      proxyHost: "localhost",
      proxyPort: 3001,
      kosHost: "localhost",
      kosPort: 5410,
    };
  const c = kos.getConfig();
  return {
    proxyHost: typeof c.host === "string" ? c.host : "localhost",
    proxyPort: typeof c.port === "number" ? c.port : 3001,
    kosHost: typeof c.kosHost === "string" ? c.kosHost : "localhost",
    kosPort: typeof c.kosPort === "number" ? c.kosPort : 5410,
  };
}

function KosTerminalComponent({ config }: ComponentProps<KosTerminalConfig>) {
  const defaults = getKosDefaults();
  const proxyHost = config?.proxyHost ?? defaults.proxyHost;
  const proxyPort = config?.proxyPort ?? defaults.proxyPort;
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
    if (!containerRef.current) return;

    const sessionId = sessionIdRef.current;

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
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    if (readOnly) {
      term.writeln("\x1b[2m[read-only]\x1b[0m");
    }

    // CPU auto-selection state — reset per effect instance
    let menuBuffer = "";
    let inMenuSelection = cpuName !== undefined;

    const url =
      `ws://${proxyHost}:${proxyPort}/kos` +
      `?host=${encodeURIComponent(kosHost)}&port=${kosPort}&id=${sessionId}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

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

    // Resize events → proxy HTTP endpoint (keeps the WS stream clean)
    term.onResize(({ cols, rows }) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      fetch(`http://${proxyHost}:${proxyPort}/kos/resize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionId, cols, rows }),
      }).catch(() => {
        /* non-critical: ignore resize errors */
      });
    });

    const observer = new ResizeObserver(() => fitAddon.fit());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      ws.close();
      term.dispose();
      wsRef.current = null;
      termRef.current = null;
    };
    // Config values are primitives — re-run the effect if any change
  }, [proxyHost, proxyPort, kosHost, kosPort, readOnly, cpuName]);

  return <Container ref={containerRef} $readOnly={readOnly} />;
}

registerComponent<KosTerminalConfig>({
  id: "kos-terminal",
  name: "kOS Terminal",
  description:
    "Interactive or read-only terminal connected to a kOS CPU via the telnet proxy.",
  tags: ["kos", "control", "telemetry"],
  defaultSize: { w: 6, h: 5 },
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

  /* xterm.js mounts a child div — make it fill the container */
  .xterm {
    height: 100%;
    padding: 8px;
  }
  .xterm-viewport {
    border-radius: 4px;
  }
`;
