import { describe, expect, it } from "vitest";
import {
  footprint,
  layoutWarnings,
  placementBox,
  railChain,
  WIRE_SPACE,
  wireZones,
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

describe("railChain", () => {
  // A horizontal rail at (1000, 2000), 500 mm long. Contactors are 45 mm wide.
  const R = at(1, rail, 1000, 2000, { length: 5000 });
  const on = (id: number, along: number, extra: Partial<PlacedGeometry> = {}) =>
    at(id, contactor, 1000 + along, 1700, { railId: R.id, ...extra });

  it("finds the parts touching in an unbroken row on both sides", () => {
    const row = [R, on(2, 0), on(3, 450), on(4, 900), on(5, 1350)];
    expect(railChain(row, 3).sort()).toEqual([2, 4, 5]);
  });

  it("stops at a gap", () => {
    const row = [R, on(2, 0), on(3, 450), on(4, 960), on(5, 1410)];
    expect(railChain(row, 2)).toEqual([3]);
    expect(railChain(row, 5)).toEqual([4]);
  });

  it("stops at a locked part and leaves it out", () => {
    const row = [R, on(2, 0), { ...on(3, 450), locked: true }, on(4, 900)];
    expect(railChain(row, 2)).toEqual([]);
  });

  it("takes overlapping parts too, but not parts on another rail", () => {
    const R2 = at(6, rail, 1000, 4000, { length: 5000 });
    const other = at(7, contactor, 1450, 3700, { railId: R2.id });
    expect(railChain([R, R2, on(2, 0), on(3, 400), other], 2)).toEqual([3]);
  });

  it("is empty for a part that isn't on a rail", () => {
    expect(railChain([R, at(2, contactor, 0, 0), on(3, 0)], 2)).toEqual([]);
  });
});

describe("wire space around terminals", () => {
  const terminal: PartGeometry = {
    kind: "TERMINAL_BLOCK",
    width: 51,
    height: 600,
    railMount: true,
    railEdgeOffset: 125,
    attributes: { levels: 1 },
  };
  const platen = { width: 10000, height: 10000 };
  // Horizontal rail at y = 3000; a strip of 10 terminals on it (top edge at y = 2875).
  const R = at(1, rail, 1000, 3000, { length: 5000 });
  const strip = at(2, terminal, 1000, 2875, { railId: 1, count: 10 });

  it("keeps 40 mm free above and below a strip, along its whole length", () => {
    expect(wireZones(strip)).toEqual([
      { x: 1000, y: 2875 - WIRE_SPACE, width: 510, height: WIRE_SPACE },
      { x: 1000, y: 2875 + 600, width: 510, height: WIRE_SPACE },
    ]);
    expect(wireZones(at(3, contactor, 0, 0))).toEqual([]);
  });

  it("turns with the strip on a vertical rail: right and left of it", () => {
    const vertical = at(4, terminal, 1000, 1000, { rotation: 90, count: 2 });
    expect(wireZones(vertical)).toEqual([
      { x: 1600, y: 1000, width: WIRE_SPACE, height: 102 },
      { x: 600, y: 1000, width: WIRE_SPACE, height: 102 },
    ]);
  });

  it("flags a gutter in the wire space, on both of them", () => {
    // A duct 30 mm above the terminals' top edge: inside the 40 mm.
    const duct = at(5, gutter, 1000, 2875 - 300 - 600, { length: 5000 });
    const w = layoutWarnings([R, strip, duct], platen);
    expect(w.get(strip.id)?.wireSpace).toEqual([duct.id]);
    expect(w.get(duct.id)?.wireSpace).toEqual([strip.id]);
    expect(w.get(strip.id)?.overlaps).toEqual([]);
  });

  it("leaves exactly 40 mm clear alone; a taller terminal needs its own 40 mm", () => {
    const duct = at(5, gutter, 1000, 2875 - WIRE_SPACE - 600, { length: 5000 });
    const taller = at(6, { ...terminal, height: 900 }, 1510, 2725, { railId: 1 });
    const w = layoutWarnings([R, strip, duct, taller], platen);
    expect(w.get(strip.id)?.wireSpace).toEqual([]);
    // The taller terminal sticks up 15 mm more, so its own 40 mm do reach the duct.
    expect(w.get(duct.id)?.wireSpace).toEqual([taller.id]);
  });
});
