import type { ComponentKind, TerminalColor } from "@cabinet-planner/shared";
import type { MantineTheme } from "@mantine/core";

/** Outline / fill colour per kind (parts are drawn as coloured outlines, no pictures). */
export function kindColors(theme: MantineTheme, dark: boolean) {
  const c = theme.colors;
  const by: Record<ComponentKind, string> = {
    STANDARD: c.blue[dark ? 4 : 6],
    SAFETY: c.yellow[dark ? 4 : 7],
    FUSE: c.orange[dark ? 4 : 6],
    TERMINAL_BLOCK: c.gray[dark ? 4 : 6],
    GROUND_TERMINAL: c.green[dark ? 5 : 7],
    GUTTER: c.gray[dark ? 6 : 5],
    RAIL: c.gray[dark ? 3 : 7],
  };
  // Real housing colours (not themed), with a caption colour that reads on each.
  const terminal: Record<TerminalColor, { fill: string; text: string }> = {
    LIGHT_GREY: { fill: "#d4d4d4", text: "#222" },
    DARK_GREY: { fill: "#5c5c5c", text: "#fff" },
    BEIGE: { fill: "#d9c9a3", text: "#222" },
    RED: { fill: c.red[7], text: "#fff" },
    GREEN: { fill: c.green[7], text: "#fff" },
    BLUE: { fill: c.blue[7], text: "#fff" },
    YELLOW: { fill: c.yellow[4], text: "#222" },
  };
  return {
    kind: by,
    terminal,
    /** Bridges (cross-connectors) across a strip. */
    bridge: c.orange[6],
    groundGreen: c.green[6],
    groundYellow: c.yellow[5],
    platen: dark ? c.dark[5] : c.gray[0],
    platenEdge: dark ? c.dark[1] : c.gray[7],
    grid: dark ? c.dark[4] : c.gray[2],
    gridMajor: dark ? c.dark[3] : c.gray[3],
    text: dark ? c.dark[0] : c.gray[9],
    warn: c.red[6],
    selected: c.blue[5],
    guide: c.pink[6],
    background: dark ? c.dark[7] : c.gray[2],
  };
}
