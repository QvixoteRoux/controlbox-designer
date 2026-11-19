import { describe, expect, it } from "vitest";
import {
  crossesDoors,
  defaultWindow,
  defaultWindows,
  faceSize,
  fitsOnFace,
  gridPositions,
  gridWarnings,
  openingShape,
  openingWarnings,
  shapesOverlap,
  type OpeningShape,
} from "./faces.js";

// 600 × 400 × 200 mm cabinet (height × width × depth), in 0.1 mm.
const cabinet = { height: 6000, width: 4000, depth: 2000 };

const rect = (x: number, y: number, width: number, height: number): OpeningShape => ({
  round: false,
  x,
  y,
  width,
  height,
});
const circle = (x: number, y: number, diameter: number): OpeningShape => ({
  round: true,
  x,
  y,
  diameter,
});

describe("faceSize", () => {
  it.each([
    ["FRONT", 4000, 6000],
    ["BACK", 4000, 6000],
    ["LEFT", 2000, 6000],
    ["RIGHT", 2000, 6000],
    ["TOP", 4000, 2000],
    ["BOTTOM", 4000, 2000],
  ] as const)("%s is %d wide and %d high", (face, width, height) => {
    expect(faceSize(cabinet, face)).toEqual({ width, height });
  });
});

describe("openingShape", () => {
  it("is a rectangle for windows and rectangular holes", () => {
    expect(openingShape({ x: 1, y: 2, width: 30, height: 40, diameter: null })).toEqual(
      rect(1, 2, 30, 40),
    );
  });

  it("is a circle for round holes, and for glands from the gland's hole diameter", () => {
    expect(openingShape({ x: 0, y: 0, width: null, height: null, diameter: 225 })).toEqual(
      circle(0, 0, 225),
    );
    expect(
      openingShape({
        x: 5,
        y: 6,
        width: null,
        height: null,
        diameter: null,
        gland: { holeDiameter: 205 },
      }),
    ).toEqual(circle(5, 6, 205));
  });
});

describe("fitsOnFace", () => {
  const front = faceSize(cabinet, "FRONT"); // 4000 × 6000

  it("accepts openings touching the edges", () => {
    // Rectangles from their top-left corner.
    expect(fitsOnFace(rect(0, 0, 4000, 100), front)).toBe(true);
    expect(fitsOnFace(rect(2000, 5900, 2000, 100), front)).toBe(true);
    // Circles from their centre.
    expect(fitsOnFace(circle(100, 100, 200), front)).toBe(true);
    expect(fitsOnFace(circle(3900, 5900, 200), front)).toBe(true);
  });

  it("rejects one sticking out on any side", () => {
    expect(fitsOnFace(rect(-1, 0, 100, 100), front)).toBe(false);
    expect(fitsOnFace(rect(0, -1, 100, 100), front)).toBe(false);
    expect(fitsOnFace(rect(3901, 0, 100, 100), front)).toBe(false);
    expect(fitsOnFace(rect(0, 5901, 100, 100), front)).toBe(false);
    expect(fitsOnFace(circle(99, 3000, 200), front)).toBe(false);
    expect(fitsOnFace(circle(2000, 5901, 200), front)).toBe(false);
  });
});

describe("shapesOverlap", () => {
  it("handles rectangles by their top-left corner, touching edges not overlapping", () => {
    expect(shapesOverlap(rect(0, 0, 100, 100), rect(50, 50, 100, 100))).toBe(true);
    expect(shapesOverlap(rect(0, 0, 100, 100), rect(100, 0, 100, 100))).toBe(false);
    expect(shapesOverlap(rect(0, 0, 100, 100), rect(0, 100, 100, 100))).toBe(false);
    expect(shapesOverlap(rect(50, 50, 100, 100), rect(0, 0, 100, 100))).toBe(true);
  });

  it("handles circles", () => {
    expect(shapesOverlap(circle(0, 0, 100), circle(99, 0, 100))).toBe(true);
    expect(shapesOverlap(circle(0, 0, 100), circle(100, 0, 100))).toBe(false);
  });

  it("handles a circle near a rectangle's corner", () => {
    // Rectangle 0…100 both ways; bottom-right corner at (100, 100).
    // Circle centre 35, 35 past that corner: ≈ 49.5 away, inside r = 50 → overlaps.
    expect(shapesOverlap(rect(0, 0, 100, 100), circle(135, 135, 100))).toBe(true);
    // Diagonal distance ≈ 49.5 > r = 40 → clear, though the bounding boxes overlap.
    expect(shapesOverlap(circle(135, 135, 80), rect(0, 0, 100, 100))).toBe(false);
    // Circle inside the rectangle.
    expect(shapesOverlap(circle(50, 50, 20), rect(0, 0, 100, 100))).toBe(true);
  });
});

describe("openingWarnings", () => {
  it("flags openings outside their face and overlaps on the same face only", () => {
    const openings = [
      { id: 1, face: "FRONT" as const, x: 0, y: 0, width: 1000, height: 1000, diameter: null },
      { id: 2, face: "FRONT" as const, x: 1100, y: 500, width: null, height: null, diameter: 300 },
      { id: 3, face: "BACK" as const, x: 0, y: 0, width: 1000, height: 1000, diameter: null },
      { id: 4, face: "LEFT" as const, x: 1900, y: 500, width: null, height: null, diameter: 300 },
    ];

    const w = openingWarnings(cabinet, openings);

    expect(w.get(1)).toEqual({ outside: false, overlaps: [2], acrossDoors: false });
    expect(w.get(2)).toEqual({ outside: false, overlaps: [1], acrossDoors: false });
    expect(w.get(3)).toEqual({ outside: false, overlaps: [], acrossDoors: false });
    // LEFT is 2000 wide: 1900 + 150 > 2000.
    expect(w.get(4)).toEqual({ outside: true, overlaps: [], acrossDoors: false });
  });
});

describe("gridPositions", () => {
  it("starts at the first hole and grows right and down (+y), row by row", () => {
    expect(
      gridPositions({ x: 200, y: 300, columns: 3, rows: 2, pitchX: 300, pitchY: 400 }),
    ).toEqual([
      { x: 200, y: 300 },
      { x: 500, y: 300 },
      { x: 800, y: 300 },
      { x: 200, y: 700 },
      { x: 500, y: 700 },
      { x: 800, y: 700 },
    ]);
  });

  it("puts a single hole exactly at (x, y), whatever the pitch", () => {
    expect(gridPositions({ x: 50, y: 70, columns: 1, rows: 1, pitchX: 0, pitchY: 0 })).toEqual([
      { x: 50, y: 70 },
    ]);
  });

  it("keeps the exact pitch between neighbours", () => {
    const xs = gridPositions({ x: 0, y: 0, columns: 3, rows: 1, pitchX: 255, pitchY: 0 }).map(
      (p) => p.x,
    );
    expect(xs).toEqual([0, 255, 510]);
  });
});

describe("gridWarnings", () => {
  const bottom = faceSize(cabinet, "BOTTOM"); // 4000 × 2000
  const at = { x: 500, y: 500 };

  it("flags a pitch smaller than the hole, per direction, only with more than one hole", () => {
    expect(
      gridWarnings({ ...at, columns: 3, rows: 1, pitchX: 200, pitchY: 0 }, 205, bottom),
    ).toEqual({ overlapX: true, overlapY: false, outside: false });
    expect(
      gridWarnings({ ...at, columns: 1, rows: 2, pitchX: 0, pitchY: 205 }, 205, bottom),
    ).toEqual({ overlapX: false, overlapY: false, outside: false });
    expect(
      gridWarnings({ ...at, columns: 2, rows: 2, pitchX: 300, pitchY: 100 }, 205, bottom),
    ).toEqual({ overlapX: false, overlapY: true, outside: false });
  });

  it("flags an array that runs off the face", () => {
    // From x = 50 mm, 10 columns 45 mm apart reach x = 455 mm: past the 400 mm width.
    expect(
      gridWarnings({ ...at, columns: 10, rows: 1, pitchX: 450, pitchY: 0 }, 205, bottom).outside,
    ).toBe(true);
    // A first hole on the top-left corner sticks out up and left.
    expect(
      gridWarnings({ x: 0, y: 0, columns: 1, rows: 1, pitchX: 0, pitchY: 0 }, 205, bottom).outside,
    ).toBe(true);
  });
});

describe("defaultWindow", () => {
  it("is centred on FRONT at half the door size, placed by its top-left corner", () => {
    expect(defaultWindow({ width: 4000, height: 6000 })).toEqual({
      kind: "WINDOW",
      face: "FRONT",
      x: 1000,
      y: 1500,
      width: 2000,
      height: 3000,
      label: null,
    });
  });

  it("rounds odd sizes to whole units", () => {
    expect(defaultWindow({ width: 4001, height: 6001 })).toMatchObject({
      x: 1000,
      y: 1500,
      width: 2001,
      height: 3001,
    });
  });
});

describe("two doors", () => {
  const twoDoors = { ...cabinet, doors: 2 };

  it("put one window in the middle of each door", () => {
    const [left, right] = defaultWindows({ width: 4000, height: 6000, doors: 2 });
    expect(left).toMatchObject({ x: 500, y: 1500, width: 1000, height: 3000 });
    expect(right).toMatchObject({ x: 2500, y: 1500, width: 1000, height: 3000 });
    expect(defaultWindows({ width: 4000, height: 6000 })).toEqual([defaultWindow(cabinet)]);
  });

  it("flag FRONT openings across the middle, not ones touching it", () => {
    expect(crossesDoors(rect(1900, 0, 200, 100), twoDoors)).toBe(true);
    expect(crossesDoors(rect(1800, 0, 200, 100), twoDoors)).toBe(false);
    expect(crossesDoors({ round: true, x: 2000, y: 500, diameter: 225 }, twoDoors)).toBe(true);
    expect(crossesDoors(rect(1900, 0, 200, 100), cabinet)).toBe(false);
  });

  it("only warn on FRONT", () => {
    const openings = [
      {
        id: 1,
        face: "FRONT" as const,
        kind: "RECT_HOLE" as const,
        x: 1900,
        y: 0,
        width: 200,
        height: 100,
        diameter: null,
        gland: null,
      },
      {
        id: 2,
        face: "BACK" as const,
        kind: "RECT_HOLE" as const,
        x: 1900,
        y: 0,
        width: 200,
        height: 100,
        diameter: null,
        gland: null,
      },
    ];
    const w = openingWarnings(twoDoors, openings);
    expect(w.get(1)?.acrossDoors).toBe(true);
    expect(w.get(2)?.acrossDoors).toBe(false);
  });
});
