export interface KosCpu {
  number: number;
  vesselName: string;
  partType: string;
  tagname: string;
}

export interface KosMenuState {
  cpus: KosCpu[];
  waitingForSelection: boolean;
}

// Matches: " [1]   no    0     Untitled Space Craft (KAL9000(name 1))"
const CPU_ROW_RE = /\[(\d+)\]\s+\S+\s+\d+\s+(.+?)\s+\(([^(]+)\(([^)]+)\)\)/;

export function parseKosMenu(text: string): KosMenuState | null {
  if (!text.includes("Vessel Name (CPU tagname)")) return null;

  const cpus: KosCpu[] = [];
  for (const line of text.split("\n")) {
    const match = CPU_ROW_RE.exec(line);
    if (match) {
      cpus.push({
        number: Number.parseInt(match[1], 10),
        vesselName: match[2].trim(),
        partType: match[3],
        tagname: match[4],
      });
    }
  }

  return { cpus, waitingForSelection: cpus.length > 0 };
}

export function parseListChanged(text: string): boolean {
  return text.includes("--(List of CPU's has Changed)--");
}
