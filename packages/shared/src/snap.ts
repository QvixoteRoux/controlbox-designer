import {
  alongRail,
  isProfile,
  lengthAlongRail,
  placementBox,
  positionOnRail,
  railFrame,
  rotatedSize,
  snapToGrid,
  type PlacedGeometry,
} from "./layout.js";
import type { Rotation } from "./schemas/placement.js";

// Snapping while moving a part on the platen (guidelines/platen-editor.md, "Snapping").
// In order: rail snap (rail-mounted parts, stacking side by side), then edge / centre
// alignment with other parts, then the grid. There's no tolerance setting: "near" is a few
// screen pixels, passed in by the editor.

export interface SnapOptions {
  /** How near counts as near, in platen units (the editor passes a few screen pixels). */
  tolerance: number;
  /** Grid step when grid snap is on, else null. */
  grid: number | null;
  platen: { width: number; height: number };
}

/** A guide line to draw: x = vertical line at that x, y = horizontal line at that y. */
export interface Guide {
  axis: "x" | "y";
  at: number;
}

export interface SnapResult {
  x: number;
  y: number;
  rotation: Rotation;
  /** The rail it landed on, or null. Always null for parts that don't mount on rails. */
  railId: number | null;
  guides: Guide[];
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Where `moving` lands when the pointer puts its centre at `centre`. `others` may include
 * `moving` itself and the parts on it; they're skipped.
 */
export function snapMove(
  moving: PlacedGeometry,
  centre: { x: number; y: number },
  others: PlacedGeometry[],
  options: SnapOptions,
): SnapResult {
  const rest = others.filter((o) => o.id !== moving.id && o.railId !== moving.id);
  if (moving.part.railMount && !isProfile(moving.part.kind)) {
    const onRail = snapToRail(moving, centre, rest, options);
    if (onRail) return onRail;
  }
  return align(moving, centre, rest, options);
}

/** The nearest rail the part's centre is over (or close to), with the part placed on it. */
function snapToRail(
  moving: PlacedGeometry,
  centre: { x: number; y: number },
  rest: PlacedGeometry[],
  { tolerance, grid }: SnapOptions,
): SnapResult | null {
  const len = lengthAlongRail(moving);
  let best: { rail: PlacedGeometry; along: number; distance: number } | null = null;

  for (const rail of rest.filter((o) => o.part.kind === "RAIL")) {
    const frame = railFrame(rail);
    const size = rotatedSize(moving.part, null, rail.rotation, moving.count);
    const lead = (frame.vertical ? centre.y : centre.x) - len / 2 - frame.start;
    if (lead + len < -tolerance || lead > frame.length + tolerance) continue; // past the ends

    const along = clamp(lead, 0, frame.length - len);
    const at = positionOnRail(rail, moving.part, along);
    const distance = frame.vertical
      ? Math.abs(at.x + size.width / 2 - centre.x)
      : Math.abs(at.y + size.height / 2 - centre.y);
    // Generous across the rail: anywhere within half the part's own size.
    const reach = Math.max(tolerance, (frame.vertical ? size.width : size.height) / 2);
    if (distance <= reach && (!best || distance < best.distance)) best = { rail, along, distance };
  }
  if (!best) return null;

  const { rail } = best;
  const frame = railFrame(rail);
  let along = best.along;
  let stacked = false;
  if (moving.part.stackable) {
    // Butt up against the nearest stackable neighbour on the same rail.
    let gap = tolerance;
    for (const s of rest.filter((o) => o.railId === rail.id && o.part.stackable)) {
      const start = alongRail(rail, s);
      const end = start + lengthAlongRail(s);
      for (const candidate of [end, start - len]) {
        const d = Math.abs(along - candidate);
        if (d <= gap) {
          gap = d;
          along = candidate;
          stacked = true;
        }
      }
    }
  }
  if (!stacked && grid !== null) {
    along = snapToGrid(frame.start + along, grid) - frame.start;
  }
  along = Math.round(clamp(along, 0, frame.length - len));
  return { ...positionOnRail(rail, moving.part, along), railId: rail.id, guides: [] };
}

/** Edges and centres line up with other parts and the platen edges, else the grid. */
function align(
  moving: PlacedGeometry,
  centre: { x: number; y: number },
  rest: PlacedGeometry[],
  { tolerance, grid, platen }: SnapOptions,
): SnapResult {
  const size = rotatedSize(moving.part, moving.length, moving.rotation, moving.count);
  const boxes = rest.map(placementBox);

  const axis = (start: number, extent: number, targets: number[], axisName: "x" | "y") => {
    let best: { d: number; at: number } | null = null;
    for (const t of targets) {
      for (const edge of [start, start + extent / 2, start + extent]) {
        const d = t - edge;
        if (Math.abs(d) <= tolerance && (!best || Math.abs(d) < Math.abs(best.d)))
          best = { d, at: t };
      }
    }
    if (best) return { value: Math.round(start + best.d), guide: { axis: axisName, at: best.at } };
    return { value: grid !== null ? snapToGrid(start, grid) : Math.round(start), guide: null };
  };

  const x = axis(
    centre.x - size.width / 2,
    size.width,
    [0, platen.width, ...boxes.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width])],
    "x",
  );
  const y = axis(
    centre.y - size.height / 2,
    size.height,
    [0, platen.height, ...boxes.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height])],
    "y",
  );
  return {
    x: x.value,
    y: y.value,
    rotation: moving.rotation,
    railId: null,
    guides: [x.guide, y.guide].filter((g): g is Guide => g !== null),
  };
}

/** Moving without snapping (Alt held): exactly where the pointer puts it, off any rail. */
export function freeMove(moving: PlacedGeometry, centre: { x: number; y: number }): SnapResult {
  const size = rotatedSize(moving.part, moving.length, moving.rotation, moving.count);
  return {
    x: Math.round(centre.x - size.width / 2),
    y: Math.round(centre.y - size.height / 2),
    rotation: moving.rotation,
    railId: null,
    guides: [],
  };
}

/** Centre of a placement's box. */
export function centreOf(p: Omit<PlacedGeometry, "id">) {
  const b = placementBox(p);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
