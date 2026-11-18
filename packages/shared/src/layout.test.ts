import { describe, expect, it } from "vitest";
import {
  footprint,
  layoutWarnings,
  placementBox,
  rotateInPlace,
  snapToGrid,
  type PartGeometry,
  type PlacedGeometry,
} from "./layout.js";
import { Rotation } from "./schemas/placement.js";

const contactor: PartGeometry = {
  kind: "STANDARD",
  width: 450,
  height: 900,
  railMount: true,
  attributes: {},
};
const box: PartGeometry = {
  kind: "STANDARD",
  width: 1000,
  height: 500,
  railMount: false,
  attributes: {},
};
const rail: PartGeometry = {
  kind: "RAIL",
  width: 350,
  height: 0,
  railMount: false,
  attributes: { stockLength: 20000 },
};
const gutter: PartGeometry = {
  kind: "GUTTER",
  width: 600,
  height: 0,
  railMount: false,
  attributes: { stockLength: 20000 },
};

const at = (
  id: number,
  part: PartGeometry,
  x: number,
  y: number,
  extra: Partial<PlacedGeometry> = {},
): PlacedGeometry => ({ id, part, x, y, rotation: 0, length: null, ...extra });

describe("footprint and rotation", () => {
  it("lays a rail horizontally at 0°: length along x, 35 mm along y", () => {
    expect(footprint(rail, 5000)).toEqual({ width: 5000, height: 350 });
    expect(placementBox(at(1, rail, 0, 0, { length: 5000, rotation: 90 }))).toEqual({
      x: 0,
      y: 0,
      width: 350,
      height: 5000,
    });
  });

  it("uses the stock length when a profile has no length yet", () => {
    expect(footprint(gutter, null)).toEqual({ width: 20000, height: 600 });
  });

  it("swaps width and height at 90°", () => {
    expect(placementBox(at(1, contactor, 10, 20))).toMatchObject({ width: 450, height: 900 });
    expect(placementBox(at(1, contactor, 10, 20, { rotation: 90 }))).toMatchObject({
      width: 900,
      height: 450,
    });
  });

  it("only takes 0° and 90°", () => {
    expect(Rotation.safeParse(90).success).toBe(true);
    expect(Rotation.safeParse(180).success).toBe(false);
    expect(Rotation.safeParse(270).success).toBe(false);
  });

  it("rotates around the centre", () => {
    // 1000 × 500 at (0, 0): centre (500, 250). Turned: 500 × 1000 → top-left (250, -250).
    expect(rotateInPlace(at(1, box, 0, 0), 90)).toEqual({ x: 250, y: -250 });
    expect(rotateInPlace(at(1, box, 250, -250, { rotation: 90 }), 0)).toEqual({ x: 0, y: 0 });
  });
});

describe("layoutWarnings", () => {
  const platen = { width: 5000, height: 4000 };

  it("flags parts off the platen", () => {
    const w = layoutWarnings([at(1, box, 4001, 0), at(2, box, 4000, 3500)], platen);
    expect(w.get(1)?.outside).toBe(true);
    expect(w.get(2)?.outside).toBe(false);
  });

  it("flags overlaps both ways, but not touching edges", () => {
    const w = layoutWarnings([at(1, box, 0, 0), at(2, box, 999, 0), at(3, box, 0, 500)], platen);
    expect(w.get(1)?.overlaps).toEqual([2]);
    expect(w.get(2)?.overlaps).toEqual([1]);
    expect(w.get(3)?.overlaps).toEqual([]);
  });

  it("doesn't flag a rail-mounted part sitting on a rail, but does flag a gutter on a rail", () => {
    const w = layoutWarnings(
      [
        at(1, rail, 0, 1000, { length: 4000 }),
        at(2, contactor, 500, 800),
        at(3, gutter, 0, 1100, { length: 4000 }),
      ],
      platen,
    );
    expect(w.get(2)?.overlaps).toEqual([3]);
    expect(w.get(1)?.overlaps).toEqual([3]);
  });

  it("flags a rail or gutter longer than its stock length", () => {
    const w = layoutWarnings(
      [at(1, rail, 0, 0, { length: 20000 }), at(2, gutter, 0, 0, { length: 20001 })],
      { width: 30000, height: 30000 },
    );
    expect(w.get(1)?.tooLong).toBe(false);
    expect(w.get(2)?.tooLong).toBe(true);
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest step", () => {
    expect([24, 25, 26, -26].map((v) => snapToGrid(v, 50))).toEqual([0, 50, 50, -50]);
  });
});
