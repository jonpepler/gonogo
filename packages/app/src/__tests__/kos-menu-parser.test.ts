import { describe, expect, it } from "vitest";
import { parseKosMenu, parseListChanged } from "../dataSources/kos-menu-parser";

const MENU_WITH_CPUS = `Terminal: type = XTERM-256COLOR, size = 123x18
__________________________________________________________________________________________________________________________
                        Menu GUI   Other
                        Pick Open Telnets  Vessel Name (CPU tagname)
                        ---- ---- -------  --------------------------------
                         [1]   no    0     Untitled Space Craft (KAL9000(name 1))
                         [2]   no    0     Untitled Space Craft (KAL9000(name 2))
                         [3]   no    0     Untitled Space Craft (CX-4181(name 3))
--------------------------------------------------------------------------------------------------------------------------
Choose a CPU to attach to by typing a selection number and pressing return/enter. Or enter [Q] to quit terminal server.

(After attaching, you can (D)etach and return to this menu by pressing Control-D as the first character on a new command
line.)
--------------------------------------------------------------------------------------------------------------------------`;

const MENU_NO_CPUS = `Terminal: type = XTERM-256COLOR, size = 123x18
__________________________________________________________________________________________________________________________
                                   Menu GUI   Other
                                   Pick Open Telnets  Vessel Name (CPU tagname)
                                   ---- ---- -------  --------------------------------
                                                                  <NONE>`;

describe("parseKosMenu", () => {
  it("returns null for non-menu text", () => {
    expect(parseKosMenu("hello kOS")).toBeNull();
    expect(parseKosMenu("")).toBeNull();
    expect(parseKosMenu("altitude=1000")).toBeNull();
  });

  it("parses a menu with CPUs into structured entries", () => {
    const result = parseKosMenu(MENU_WITH_CPUS);
    expect(result).not.toBeNull();
    expect(result?.cpus).toHaveLength(3);
    expect(result?.waitingForSelection).toBe(true);
  });

  it("parses CPU number, vesselName, partType, and tagname correctly", () => {
    const result = parseKosMenu(MENU_WITH_CPUS);
    expect(result?.cpus[0]).toEqual({
      number: 1,
      vesselName: "Untitled Space Craft",
      partType: "KAL9000",
      tagname: "name 1",
    });
    expect(result?.cpus[1]).toEqual({
      number: 2,
      vesselName: "Untitled Space Craft",
      partType: "KAL9000",
      tagname: "name 2",
    });
    expect(result?.cpus[2]).toEqual({
      number: 3,
      vesselName: "Untitled Space Craft",
      partType: "CX-4181",
      tagname: "name 3",
    });
  });

  it("parses a menu with no CPUs as empty list, not waiting for selection", () => {
    const result = parseKosMenu(MENU_NO_CPUS);
    expect(result).not.toBeNull();
    expect(result?.cpus).toHaveLength(0);
    expect(result?.waitingForSelection).toBe(false);
  });
});

describe("parseListChanged", () => {
  it("detects the list-changed marker", () => {
    expect(parseListChanged("--(List of CPU's has Changed)--")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(parseListChanged("altitude=1000")).toBe(false);
    expect(parseListChanged("")).toBe(false);
  });
});
