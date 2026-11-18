import { stockLength } from "./schemas/component.js";
import type { ComponentKind } from "./schemas/enums.js";
import type { Rotation } from "./schemas/placement.js";

// Platen layout geometry (guidelines/platen-editor.md). Platen coordinates: origin at the
// platen's top-left, +x right, +y down, in 0.1 mm. A placement's x / y is the top-left corner
// of its bounding box after rotation.

/** The catalog fields geometry needs. */
export interface PartGeometry {
  kind: ComponentKind;
  width: number;
  height: number;
  railMount: boolean;
  attributes: unknown;
}

export interface PlacedGeometry {
  id: number;
  x: number;
  y: number;
  rotation: Rotation;
  length: number | null;
  part: PartGeometry;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Rails and gutters: profiles whose length is set per placement. */
export const isProfile = (kind: ComponentKind) => kind === "RAIL" || kind === "GUTTER";

/**
 * Size before rotation. Profiles lie horizontally at 0°: the length runs along x and the
 * profile width along y. Everything else is its catalog width × height as mounted.
 */
export function footprint(part: PartGeometry, length: number | null) {
  return isProfile(part.kind)
    ? { width: length ?? stockLength(part) ?? 0, height: part.width }
    : { width: part.width, height: part.height };
}

/** Width × height after rotation: 90° swaps them. */
export function rotatedSize(part: PartGeometry, length: number | null, rotation: Rotation) {
  const f = footprint(part, length);
  return rotation === 90 ? { width: f.height, height: f.width } : f;
}

export function placementBox(p: Omit<PlacedGeometry, "id">): Box {
  return { x: p.x, y: p.y, ...rotatedSize(p.part, p.length, p.rotation) };
}

/** The new top-left after turning to `rotation`, keeping the centre where it was. */
export function rotateInPlace(p: Omit<PlacedGeometry, "id">, rotation: Rotation) {
  const before = placementBox(p);
  const after = rotatedSize(p.part, p.length, rotation);
  return {
    x: Math.round(before.x + before.width / 2 - after.width / 2),
    y: Math.round(before.y + before.height / 2 - after.height / 2),
  };
}

/** True when two boxes overlap (touching edges don't count). */
export const boxesOverlap = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export const boxInside = (b: Box, area: { width: number; height: number }) =>
  b.x >= 0 && b.y >= 0 && b.x + b.width <= area.width && b.y + b.height <= area.height;

/** A rail and a part that mounts on rails are meant to overlap. */
const overlapExpected = (a: PartGeometry, b: PartGeometry) =>
  (a.kind === "RAIL" && b.railMount) || (b.kind === "RAIL" && a.railMount);

export interface LayoutWarnings {
  /** Sticks out past the platen. */
  outside: boolean;
  /** Ids of placements it overlaps (rails under rail-mounted parts don't count). */
  overlaps: number[];
  /** A rail or gutter longer than its catalog stock length. */
  tooLong: boolean;
}

export const hasWarning = (w: LayoutWarnings | undefined) =>
  w !== undefined && (w.outside || w.overlaps.length > 0 || w.tooLong);

/** Warnings per placement id. They're shown, never enforced. */
export function layoutWarnings(
  placements: PlacedGeometry[],
  platen: { width: number; height: number },
): Map<number, LayoutWarnings> {
  const boxes = placements.map((p) => ({ p, box: placementBox(p) }));
  const result = new Map<number, LayoutWarnings>();
  for (const { p, box } of boxes) {
    const stock = stockLength(p.part);
    result.set(p.id, {
      outside: !boxInside(box, platen),
      overlaps: boxes
        .filter(
          (o) => o.p.id !== p.id && !overlapExpected(p.part, o.p.part) && boxesOverlap(box, o.box),
        )
        .map((o) => o.p.id),
      tooLong: stock !== null && p.length !== null && p.length > stock,
    });
  }
  return result;
}

/** Rounds a coordinate to the nearest multiple of `step` (0.1 mm units). */
export const snapToGrid = (value: number, step: number) => Math.round(value / step) * step;
