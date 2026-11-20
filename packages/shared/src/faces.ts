import type { Face } from "./schemas/enums.js";

// Cabinet-face geometry (guidelines/units-and-coordinates.md). Every face has its own 2D system:
// origin at the face's top-left corner, +x right, +y down, seen from outside. All values in 0.1 mm.
// Round openings (round holes, glands) are placed by their centre; rectangular ones (windows,
// rectangular holes) by their top-left corner.

export interface Size {
  width: number;
  height: number;
}

/** Width × height of a face: FRONT/BACK w×h, LEFT/RIGHT d×h, TOP/BOTTOM w×d. */
export function faceSize(
  cabinet: { width: number; height: number; depth: number },
  face: Face,
): Size {
  switch (face) {
    case "FRONT":
    case "BACK":
      return { width: cabinet.width, height: cabinet.height };
    case "LEFT":
    case "RIGHT":
      return { width: cabinet.depth, height: cabinet.height };
    case "TOP":
    case "BOTTOM":
      return { width: cabinet.width, height: cabinet.depth };
  }
}

/** The faces next to each edge of a face's view. */
export interface FaceNeighbours {
  top: Face;
  bottom: Face;
  left: Face;
  right: Face;
}

/**
 * Which face lies past each edge of a face's view, seen from outside (TOP and BOTTOM with FRONT
 * toward the viewer, at the bottom of the view). BACK and BOTTOM come out mirrored left to right.
 * The platen is seen from the front, so it uses FRONT's neighbours.
 */
export function faceNeighbours(face: Face): FaceNeighbours {
  switch (face) {
    case "FRONT":
      return { top: "TOP", bottom: "BOTTOM", left: "LEFT", right: "RIGHT" };
    case "BACK":
      return { top: "TOP", bottom: "BOTTOM", left: "RIGHT", right: "LEFT" };
    case "LEFT":
      return { top: "TOP", bottom: "BOTTOM", left: "BACK", right: "FRONT" };
    case "RIGHT":
      return { top: "TOP", bottom: "BOTTOM", left: "FRONT", right: "BACK" };
    case "TOP":
      return { top: "BACK", bottom: "FRONT", left: "LEFT", right: "RIGHT" };
    case "BOTTOM":
      return { top: "BACK", bottom: "FRONT", left: "RIGHT", right: "LEFT" };
  }
}

/**
 * The outline of an opening on its face: a rectangle from its top-left corner (x, y), with
 * rounded corners when it has a `radius` (bottom plates), or a circle around its centre (x, y).
 */
export type OpeningShape =
  | { round: false; x: number; y: number; width: number; height: number; radius?: number }
  | { round: true; x: number; y: number; diameter: number };
type RectShape = Extract<OpeningShape, { round: false }>;

/**
 * The shape an opening cuts. Glands cut a round hole of the gland's hole diameter.
 * Returns null when the size isn't known (e.g. a gland whose data is missing).
 */
export function openingShape(o: {
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  diameter: number | null;
  cornerRadius?: number | null;
  gland?: { holeDiameter: number } | null;
}): OpeningShape | null {
  if (o.width !== null && o.height !== null) {
    const rect = { round: false as const, x: o.x, y: o.y, width: o.width, height: o.height };
    return o.cornerRadius ? { ...rect, radius: o.cornerRadius } : rect;
  }
  const diameter = o.diameter ?? o.gland?.holeDiameter ?? null;
  return diameter === null ? null : { round: true, x: o.x, y: o.y, diameter };
}

/** The bounding box of an opening: left, top, right, bottom. */
export function shapeBounds(s: OpeningShape) {
  if (s.round) {
    const r = s.diameter / 2;
    return { left: s.x - r, top: s.y - r, right: s.x + r, bottom: s.y + r };
  }
  return { left: s.x, top: s.y, right: s.x + s.width, bottom: s.y + s.height };
}

/** True when the whole opening lies on the face (touching the edge counts as inside). */
export function fitsOnFace(shape: OpeningShape, face: Size): boolean {
  const b = shapeBounds(shape);
  return b.left >= 0 && b.top >= 0 && b.right <= face.width && b.bottom <= face.height;
}

/**
 * A shape as a core rectangle grown by a radius: a circle is its centre grown by its radius, a
 * rounded rectangle the rectangle inside its corner arcs grown by the corner radius.
 */
function cored(s: OpeningShape) {
  if (s.round) {
    return { left: s.x, top: s.y, right: s.x, bottom: s.y, r: s.diameter / 2 };
  }
  const r = s.radius ?? 0;
  return { left: s.x + r, top: s.y + r, right: s.x + s.width - r, bottom: s.y + s.height - r, r };
}

type Core = ReturnType<typeof cored>;

/** Shortest distance between two core rectangles (0 when they touch or cross). */
function coreGap(a: Core, b: Core) {
  const dx = Math.max(a.left - b.right, 0, b.left - a.right);
  const dy = Math.max(a.top - b.bottom, 0, b.top - a.bottom);
  return Math.hypot(dx, dy);
}

/** True when two openings overlap (touching edges don't count). Rounded corners count as cut away. */
export function shapesOverlap(a: OpeningShape, b: OpeningShape): boolean {
  if ((!a.round && a.radius) || (!b.round && b.radius)) {
    const ca = cored(a);
    const cb = cored(b);
    return coreGap(ca, cb) < ca.r + cb.r;
  }
  if (a.round && b.round) {
    const r = a.diameter / 2 + b.diameter / 2;
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 < r * r;
  }
  if (!a.round && !b.round) {
    return (
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    );
  }
  const [circle, rect] = a.round
    ? [a, b as Extract<OpeningShape, { round: false }>]
    : [b as Extract<OpeningShape, { round: true }>, a];
  // Distance from the circle centre to the nearest point of the rectangle.
  const dx = Math.max(rect.x - circle.x, 0, circle.x - (rect.x + rect.width));
  const dy = Math.max(rect.y - circle.y, 0, circle.y - (rect.y + rect.height));
  const r = circle.diameter / 2;
  return dx * dx + dy * dy < r * r;
}

/**
 * True when `inner` lies wholly within the rectangle `outer`, rounded corners included (touching
 * the edge counts as within). A rounded `inner` is checked by its bounding box.
 */
export function shapeWithin(inner: OpeningShape, outer: RectShape): boolean {
  const core = cored(outer);
  if (inner.round) {
    const r = inner.diameter / 2;
    if (r > core.r) {
      // Bigger than the corner arcs: only the straight edges can stop it.
      return (
        inner.x - r >= outer.x &&
        inner.y - r >= outer.y &&
        inner.x + r <= outer.x + outer.width &&
        inner.y + r <= outer.y + outer.height
      );
    }
    return coreGap(cored(inner), core) <= core.r - r;
  }
  const b = shapeBounds(inner);
  const corners: [number, number][] = [
    [b.left, b.top],
    [b.right, b.top],
    [b.left, b.bottom],
    [b.right, b.bottom],
  ];
  return corners.every(
    ([x, y]) => coreGap({ left: x, top: y, right: x, bottom: y, r: 0 }, core) <= core.r,
  );
}

// ── Bottom plates ──

/** "Bottom plate: yes" adds one at 70 % of the bottom face each way (owner, 2026-11-20). */
export const BOTTOM_PLATE_SHARE = 0.7;
/** Default corner radius: 10 mm (owner, 2026-11-20). */
export const BOTTOM_PLATE_RADIUS = 100;

/**
 * The bottom plate that "Bottom plate: yes" creates: centred on BOTTOM (width × depth), 70 % of
 * it each way, corners rounded 10 mm (less on a plate too small for that). x / y is its top-left
 * corner, rounded to whole units.
 */
export function defaultBottomPlate(cabinet: { width: number; depth: number }) {
  const width = Math.round(cabinet.width * BOTTOM_PLATE_SHARE);
  const height = Math.round(cabinet.depth * BOTTOM_PLATE_SHARE);
  return {
    kind: "BOTTOM_PLATE" as const,
    face: "BOTTOM" as const,
    x: Math.round((cabinet.width - width) / 2),
    y: Math.round((cabinet.depth - height) / 2),
    width,
    height,
    cornerRadius: Math.min(BOTTOM_PLATE_RADIUS, Math.floor(Math.min(width, height) / 2)),
    label: null,
  };
}

export interface OpeningWarnings {
  outside: boolean;
  /** Ids of other openings on the same face that this one overlaps. */
  overlaps: number[];
  /** On FRONT of a 2-door cabinet, it crosses the middle where the two doors meet. */
  acrossDoors: boolean;
}

export const hasOpeningWarning = (w: OpeningWarnings | undefined) =>
  w !== undefined && (w.outside || w.overlaps.length > 0 || w.acrossDoors);

/** True when a shape on FRONT crosses the line where two doors meet (touching it doesn't). */
export function crossesDoors(shape: OpeningShape, cabinet: { width: number; doors?: number }) {
  if (cabinet.doors !== 2) return false;
  const b = shapeBounds(shape);
  const middle = cabinet.width / 2;
  return b.left < middle && b.right > middle;
}

/**
 * Whether two openings on the same face clash. A hole and a bottom plate only clash when the
 * hole crosses the plate's edge: one wholly on the plate or wholly off it is fine (owner,
 * 2026-11-20), since holes may be cut in the plate or beside it.
 */
function clash(
  a: { kind?: string; shape: OpeningShape },
  b: { kind?: string; shape: OpeningShape },
): boolean {
  if (!shapesOverlap(a.shape, b.shape)) return false;
  const aPlate = a.kind === "BOTTOM_PLATE" && !a.shape.round;
  const bPlate = b.kind === "BOTTOM_PLATE" && !b.shape.round;
  if (aPlate === bPlate) return true;
  const [plate, hole] = aPlate ? [a.shape, b.shape] : [b.shape, a.shape];
  return plate.round || !shapeWithin(hole, plate);
}

/**
 * Warnings per opening id: outside its face, overlapping another opening on the same face
 * (for a bottom plate: a hole crossing its edge), or (2-door cabinets) across the middle of
 * FRONT where the doors meet.
 */
export function openingWarnings<
  O extends { id: number; face: Face; kind?: string } & Parameters<typeof openingShape>[0],
>(cabinet: { width: number; height: number; depth: number; doors?: number }, openings: O[]) {
  const shapes = openings.map((o) => ({ o, shape: openingShape(o) }));
  const result = new Map<number, OpeningWarnings>();
  for (const { o, shape } of shapes) {
    const overlaps = shape
      ? shapes
          .filter(
            (other) =>
              other.o.id !== o.id &&
              other.o.face === o.face &&
              other.shape !== null &&
              clash({ kind: o.kind, shape }, { kind: other.o.kind, shape: other.shape }),
          )
          .map((other) => other.o.id)
      : [];
    result.set(o.id, {
      outside: shape !== null && !fitsOnFace(shape, faceSize(cabinet, o.face)),
      overlaps,
      acrossDoors: shape !== null && o.face === "FRONT" && crossesDoors(shape, cabinet),
    });
  }
  return result;
}

/**
 * The windows that "Window: yes" creates: one centred on FRONT for a 1-door cabinet; one per
 * door for a 2-door cabinet, each centred in its door at half the door's width and height.
 */
export function defaultWindows(cabinet: { width: number; height: number; doors?: number }) {
  if (cabinet.doors !== 2) return [defaultWindow(cabinet)];
  const door = Math.round(cabinet.width / 2);
  const left = defaultWindow({ width: door, height: cabinet.height });
  return [left, { ...left, x: left.x + cabinet.width - door }];
}

/**
 * The window that "Window: yes" creates: centred on FRONT (width × height), half the door's width
 * and height. x / y is its top-left corner, rounded to whole units.
 */
export function defaultWindow(cabinet: { width: number; height: number }) {
  const width = Math.round(cabinet.width / 2);
  const height = Math.round(cabinet.height / 2);
  return {
    kind: "WINDOW" as const,
    face: "FRONT" as const,
    x: Math.round((cabinet.width - width) / 2),
    y: Math.round((cabinet.height - height) / 2),
    width,
    height,
    label: null,
  };
}

// ── Gland arrays ──

export interface GridSpec {
  /** Centre of the first (top-left) hole on the face. */
  x: number;
  y: number;
  columns: number;
  rows: number;
  /** Centre-to-centre spacing between columns / rows. */
  pitchX: number;
  pitchY: number;
}

/**
 * Hole centres of a columns × rows grid starting at the first hole (x, y) and growing to the
 * right (+x) and down (+y), listed row by row from that first hole.
 */
export function gridPositions(g: GridSpec): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.columns; col++) {
      positions.push({ x: g.x + col * g.pitchX, y: g.y + row * g.pitchY });
    }
  }
  return positions;
}

export interface GridWarnings {
  /** Neighbouring holes overlap: the pitch is smaller than the hole diameter. */
  overlapX: boolean;
  overlapY: boolean;
  /** Some hole sticks out past the face. */
  outside: boolean;
}

/** What's wrong with a gland array before it's saved. Touching holes don't count as overlapping. */
export function gridWarnings(g: GridSpec, holeDiameter: number, face: Size): GridWarnings {
  return {
    overlapX: g.columns > 1 && g.pitchX < holeDiameter,
    overlapY: g.rows > 1 && g.pitchY < holeDiameter,
    outside: gridPositions(g).some(
      (p) => !fitsOnFace({ round: true, ...p, diameter: holeDiameter }, face),
    ),
  };
}
