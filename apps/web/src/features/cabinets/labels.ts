import type { Face, OpeningKind } from "@cabinet-planner/shared";

export const KIND_LABELS: Record<OpeningKind, string> = {
  WINDOW: "Window",
  RECT_HOLE: "Rectangular hole",
  ROUND_HOLE: "Round hole",
  CABLE_GLAND: "Cable gland",
};

export const FACE_LABELS: Record<Face, string> = {
  FRONT: "Front (door)",
  BACK: "Back",
  LEFT: "Left",
  RIGHT: "Right",
  TOP: "Top",
  BOTTOM: "Bottom",
};
