import type { ComponentKind, TerminalColor } from "@cabinet-planner/shared";

export const COMPONENT_KIND_LABELS: Record<ComponentKind, string> = {
  STANDARD: "Standard",
  SAFETY: "Safety",
  FUSE: "Fuse",
  RELAY: "Relay",
  TERMINAL_BLOCK: "Terminal block",
  GROUND_TERMINAL: "Ground terminal",
  GUTTER: "Wire duct (gutter)",
  RAIL: "DIN rail",
};

export const TERMINAL_COLOR_LABELS: Record<TerminalColor, string> = {
  LIGHT_GREY: "Light grey",
  DARK_GREY: "Dark grey",
  BEIGE: "Beige",
  RED: "Red",
  GREEN: "Green",
  BLUE: "Blue",
  YELLOW: "Yellow",
};

/** One line describing a catalog item, for pickers and tables. */
export const partLabel = (c: { manufacturer: string; partNumber: string; code?: string | null }) =>
  `${c.manufacturer} ${c.partNumber}${c.code ? ` (${c.code})` : ""}`;
