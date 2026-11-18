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
  /** From the part's top edge to the rail's top edge (rail-mounted parts). */
  railEdgeOffset?: number | null;
  /** Butts up against its snappable neighbours on a rail. */
  snappable?: boolean;
  attributes: unknown;
}

export interface PlacedGeometry {
  id: number;
  x: number;
  y: number;
  rotation: Rotation;
  length: number | null;
  /** The rail placement this part is snapped to. */
  railId?: number | null;
  /** Terminal strips: terminals side by side along the rail (1 when not given). */
  count?: number;
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
 * profile width along y. A terminal strip is `count` terminals wide. Everything else is its
 * catalog width × height as mounted.
 */
export function footprint(part: PartGeometry, length: number | null, count = 1) {
  return isProfile(part.kind)
    ? { width: length ?? stockLength(part) ?? 0, height: part.width }
    : { width: part.width * count, height: part.height };
}

/** Width × height after rotation: 90° swaps them. */
export function rotatedSize(
  part: PartGeometry,
  length: number | null,
  rotation: Rotation,
  count = 1,
) {
  const f = footprint(part, length, count);
  return rotation === 90 ? { width: f.height, height: f.width } : f;
}

export function placementBox(p: Omit<PlacedGeometry, "id">): Box {
  return { x: p.x, y: p.y, ...rotatedSize(p.part, p.length, p.rotation, p.count) };
}

/** How much rail a part takes: its width, times the count for a terminal strip. */
export const lengthAlongRail = (p: Pick<PlacedGeometry, "part" | "count">) =>
  p.part.width * (p.count ?? 1);

/** The new top-left after turning to `rotation`, keeping the centre where it was. */
export function rotateInPlace(p: Omit<PlacedGeometry, "id">, rotation: Rotation) {
  const before = placementBox(p);
  const after = rotatedSize(p.part, p.length, rotation);
  return {
    x: Math.round(before.x + before.width / 2 - after.width / 2),
    y: Math.round(before.y + before.height / 2 - after.height / 2),
  };
}

// ── Rails ──
// A rail-mounted part sits on a rail at a distance `along` from the rail's start (its left end
// when horizontal, its top end when vertical) and turns with the rail: 0° on a horizontal
// rail, 90° on a vertical one. The part's width always runs along the rail.

export function railFrame(rail: Omit<PlacedGeometry, "id">) {
  const box = placementBox(rail);
  const vertical = rail.rotation === 90;
  return {
    box,
    vertical,
    start: vertical ? box.y : box.x,
    length: vertical ? box.height : box.width,
  };
}

/** Rail edge offset, or centred on the rail when the catalog doesn't give one. */
const edgeOffset = (part: PartGeometry, railWidth: number) =>
  part.railEdgeOffset ?? Math.round((part.height - railWidth) / 2);

/**
 * Where a rail-mounted part goes on a rail, `along` from the rail's start. Horizontal: the
 * rail's top edge is `railEdgeOffset` below the part's top edge. Vertical (the part turned
 * 90° clockwise, so its top edge faces right): the rail's right edge is `railEdgeOffset`
 * left of the part's right edge.
 */
export function positionOnRail(
  rail: Omit<PlacedGeometry, "id">,
  part: PartGeometry,
  along: number,
): { x: number; y: number; rotation: Rotation } {
  const { box, vertical } = railFrame(rail);
  if (!vertical) {
    return { x: box.x + along, y: box.y - edgeOffset(part, box.height), rotation: 0 };
  }
  const size = rotatedSize(part, null, 90);
  return {
    x: box.x + box.width + edgeOffset(part, box.width) - size.width,
    y: box.y + along,
    rotation: 90,
  };
}

/** How far along the rail a part's leading edge (left or top) is. */
export function alongRail(rail: Omit<PlacedGeometry, "id">, p: { x: number; y: number }) {
  const { box, vertical } = railFrame(rail);
  return vertical ? p.y - box.y : p.x - box.x;
}

/** True when a part is no longer where its rail puts it, or hangs past the rail's ends. */
export function offItsRail(p: PlacedGeometry, rail: PlacedGeometry) {
  const along = alongRail(rail, p);
  const at = positionOnRail(rail, p.part, along);
  const misplaced = at.x !== p.x || at.y !== p.y || at.rotation !== p.rotation;
  return misplaced || along < 0 || along + lengthAlongRail(p) > railFrame(rail).length;
}

/**
 * The chain of a part on a rail: the other parts on the same rail that touch it in an unbroken
 * row (side by side with no gap, or overlapping), found by walking outwards from it. Dragging
 * the part moves the chain with it. A locked part ends the row and isn't in it. Parts not on a
 * rail have no chain.
 */
export function railChain<T extends PlacedGeometry & { locked?: boolean }>(
  placements: T[],
  id: number,
): number[] {
  const start = placements.find((p) => p.id === id);
  const rail = start && placements.find((p) => p.id === start.railId);
  if (!start || !rail) return [];
  const span = (p: T) => {
    const a = alongRail(rail, p);
    return { from: a, to: a + lengthAlongRail(p) };
  };
  let { from, to } = span(start);
  const chain: number[] = [];
  const candidates = placements.filter((p) => p.id !== id && p.railId === rail.id && !p.locked);
  for (let grown = true; grown;) {
    grown = false;
    for (const p of candidates) {
      if (chain.includes(p.id)) continue;
      const s = span(p);
      if (s.from <= to && s.to >= from) {
        chain.push(p.id);
        from = Math.min(from, s.from);
        to = Math.max(to, s.to);
        grown = true;
      }
    }
  }
  return chain;
}

/**
 * Applies a change to one placement. When it's a rail that moves, turns or gets resized,
 * the parts on it come along: each keeps its distance along the rail and turns with it.
 * The editor (live while dragging, and optimistically) and the API use this same function.
 */
export function withPatch<T extends PlacedGeometry>(
  placements: T[],
  id: number,
  patch: Partial<Omit<T, "id" | "part">>,
): T[] {
  const before = placements.find((p) => p.id === id);
  if (!before) return placements;
  const after: T = { ...before, ...patch };
  const carried = new Map<number, { x: number; y: number; rotation: Rotation }>();
  if (before.part.kind === "RAIL") {
    for (const p of placements) {
      if (p.railId === id) carried.set(p.id, positionOnRail(after, p.part, alongRail(before, p)));
    }
  }
  return placements.map((p) => {
    if (p.id === id) return after;
    const moved = carried.get(p.id);
    return moved ? { ...p, ...moved } : p;
  });
}

/**
 * Where a rail or gutter is dimensioned to from the platen's top-left corner (owner,
 * 2026-11-18): its start end and its centreline. Horizontal: x = left end, y = centreline.
 * Vertical: x = centreline, y = top end. Platen units (0.1 mm).
 */
export function profileDatum(p: Omit<PlacedGeometry, "id">) {
  const b = placementBox(p);
  return p.rotation === 90 ? { x: b.x + b.width / 2, y: b.y } : { x: b.x, y: b.y + b.height / 2 };
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
  /** A part on a rail that hangs past the rail's ends (e.g. after the rail was shortened). */
  offRail: boolean;
}

export const hasWarning = (w: LayoutWarnings | undefined) =>
  w !== undefined && (w.outside || w.overlaps.length > 0 || w.tooLong || w.offRail);

/** Warnings per placement id. They're shown, never enforced. */
export function layoutWarnings(
  placements: PlacedGeometry[],
  platen: { width: number; height: number },
): Map<number, LayoutWarnings> {
  const boxes = placements.map((p) => ({ p, box: placementBox(p) }));
  const byId = new Map(placements.map((p) => [p.id, p]));
  const result = new Map<number, LayoutWarnings>();
  for (const { p, box } of boxes) {
    const stock = stockLength(p.part);
    const rail = p.railId == null ? undefined : byId.get(p.railId);
    result.set(p.id, {
      outside: !boxInside(box, platen),
      overlaps: boxes
        .filter(
          (o) => o.p.id !== p.id && !overlapExpected(p.part, o.p.part) && boxesOverlap(box, o.box),
        )
        .map((o) => o.p.id),
      tooLong: stock !== null && p.length !== null && p.length > stock,
      offRail: rail !== undefined && offItsRail(p, rail),
    });
  }
  return result;
}

/** Rounds a coordinate to the nearest multiple of `step` (0.1 mm units). */
export const snapToGrid = (value: number, step: number) => Math.round(value / step) * step;
