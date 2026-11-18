import { describe, expect, it } from "vitest";
import {
  layoutWarnings,
  placementBox,
  positionOnRail,
  withPatch,
  type PartGeometry,
  type PlacedGeometry,
} from "./layout.js";
import { CreatePlacementInput } from "./schemas/placement.js";
import { freeMove, snapMove, type SnapOptions } from "./snap.js";

const railPart: PartGeometry = {
  kind: "RAIL",
  width: 350,
  height: 0,
  railMount: false,
  attributes: { stockLength: 20000 },
};
/** 45 × 90 mm, the rail's top edge 20 mm below its top edge. */
const contactor: PartGeometry = {
  kind: "STANDARD",
  width: 450,
  height: 900,
  railMount: true,
  railEdgeOffset: 200,
  stackable: true,
  attributes: {},
};
const panel: PartGeometry = {
  kind: "STANDARD",
  width: 1000,
  height: 500,
  railMount: false,
  attributes: {},
};

const place = (
  id: number,
  part: PartGeometry,
  x: number,
  y: number,
  extra: Partial<PlacedGeometry> = {},
): PlacedGeometry => ({ id, part, x, y, rotation: 0, length: null, railId: null, ...extra });

/** Horizontal rail, 500 mm long, from (100, 200) mm. */
const H = place(1, railPart, 1000, 2000, { length: 5000 });
/** Vertical rail, 400 mm long, from (800, 50) mm. */
const V = place(2, railPart, 8000, 500, { length: 4000, rotation: 90 });
const moving = place(10, contactor, 0, 0);
const options: SnapOptions = { tolerance: 50, grid: null, platen: { width: 10000, height: 8000 } };

describe("positionOnRail", () => {
  it("hangs a part on a horizontal rail by its rail edge offset", () => {
    expect(positionOnRail(H, contactor, 300)).toEqual({ x: 1300, y: 1800, rotation: 0 });
  });

  it("turns the part 90° on a vertical rail, its top edge facing right", () => {
    // Turned box 900 × 450; right edge 20 mm past the rail's right edge (8350).
    expect(positionOnRail(V, contactor, 100)).toEqual({ x: 7650, y: 600, rotation: 90 });
  });

  it("centres a part on the rail when the catalog has no offset", () => {
    const noOffset = { ...contactor, railEdgeOffset: null };
    expect(positionOnRail(H, noOffset, 0).y).toBe(2000 - (900 - 350) / 2);
  });
});

describe("snapMove onto rails", () => {
  it("snaps a rail-mounted part onto a nearby horizontal rail", () => {
    // Snapped centre would be (1555, 2250); the pointer is a bit off.
    const r = snapMove(moving, { x: 1585, y: 2310 }, [H, V], options);
    expect(r).toMatchObject({ x: 1360, y: 1800, rotation: 0, railId: H.id });
  });

  it("follows a vertical rail's orientation", () => {
    const r = snapMove(moving, { x: 8080, y: 840 }, [H, V], options);
    expect(r).toMatchObject({ x: 7650, y: 615, rotation: 90, railId: V.id });
  });

  it("slides along the grid on the rail when grid snap is on", () => {
    const r = snapMove(moving, { x: 1585, y: 2310 }, [H], { ...options, grid: 50 });
    expect(r).toMatchObject({ x: 1350, y: 1800, railId: H.id });
  });

  it("stays within the rail's ends", () => {
    const r = snapMove(moving, { x: 5900, y: 2250 }, [H], options);
    expect(r.x).toBe(1000 + 5000 - 450);
  });

  it("butts stackable parts up against each other", () => {
    const neighbour = place(11, contactor, 2000, 1800, { railId: H.id }); // along 1000…1450
    const r = snapMove(moving, { x: 1000 + 1470 + 225, y: 2250 }, [H, neighbour], options);
    expect(r).toMatchObject({ x: 2450, railId: H.id });
  });

  it("comes off the rail when dragged clearly away", () => {
    const r = snapMove(moving, { x: 1555, y: 3500 }, [H], options);
    expect(r.railId).toBeNull();
  });

  it("never puts parts that don't mount on rails onto a rail", () => {
    const r = snapMove(place(12, panel, 0, 0), { x: 1555, y: 2175 }, [H], options);
    expect(r.railId).toBeNull();
  });
});

describe("snapMove alignment", () => {
  it("lines edges up with nearby parts and reports a guide", () => {
    const other = place(20, panel, 3000, 3000);
    const r = snapMove(place(21, panel, 0, 0), { x: 3520, y: 4250 }, [other], options);
    expect(r).toMatchObject({ x: 3000, y: 4000, guides: [{ axis: "x", at: 3000 }] });
  });

  it("falls back to the grid when nothing is near", () => {
    const r = snapMove(place(21, panel, 0, 0), { x: 5530, y: 4270 }, [], { ...options, grid: 50 });
    expect(r).toMatchObject({ x: 5050, y: 4000, guides: [] });
  });

  it("moves freely with Alt", () => {
    expect(freeMove(moving, { x: 1585, y: 2310 })).toMatchObject({
      x: 1360,
      y: 1860,
      railId: null,
    });
  });
});

describe("withPatch: parts follow their rail", () => {
  const child = place(30, contactor, 1300, 1800, { railId: H.id }); // along 300

  it("moves the parts with the rail", () => {
    const after = withPatch([H, child], H.id, { x: 1500, y: 2500 });
    expect(after[1]).toMatchObject({ x: 1800, y: 2300, rotation: 0 });
  });

  it("turns them when the rail turns", () => {
    const after = withPatch([H, child], H.id, { rotation: 90 });
    const rail = after[0]!;
    expect(after[1]).toMatchObject({ ...positionOnRail(rail, contactor, 300), rotation: 90 });
  });

  it("warns about parts hanging past the end of a shortened rail", () => {
    const far = place(31, contactor, 1800, 1800, { railId: H.id }); // along 800…1250
    const after = withPatch([H, child, far], H.id, { length: 1000 });
    const warnings = layoutWarnings(after, options.platen);
    expect(warnings.get(child.id)?.offRail).toBe(false);
    expect(warnings.get(far.id)?.offRail).toBe(true);
  });
});

describe("terminal strips", () => {
  /** WDU 2.5: 5.1 mm pitch, 60 mm high, rail centred (offset 12.5 mm). */
  const terminal: PartGeometry = {
    kind: "TERMINAL_BLOCK",
    width: 51,
    height: 600,
    railMount: true,
    railEdgeOffset: 125,
    stackable: true,
    attributes: { levels: 1 },
  };

  it("is count terminals long along the rail, either way round", () => {
    const strip = place(40, terminal, 0, 0, { count: 10 });
    expect(placementBox(strip)).toMatchObject({ width: 510, height: 600 });
    expect(placementBox({ ...strip, rotation: 90 })).toMatchObject({ width: 600, height: 510 });
  });

  it("butts up against a neighbouring strip's far end", () => {
    const first = place(41, terminal, 1000, 1875, { railId: H.id, count: 10 }); // along 0…510
    const next = place(42, terminal, 0, 0, { count: 4 });
    const r = snapMove(next, { x: 1000 + 520 + 102, y: 2175 }, [H, first], options);
    expect(r).toMatchObject({ x: 1510, y: 1875, railId: H.id });
  });

  it("warns when a strip grows past the end of its rail", () => {
    const strip = place(43, terminal, 1000 + 4800, 1875, { railId: H.id, count: 3 }); // 4800…4953
    expect(layoutWarnings([H, strip], options.platen).get(43)?.offRail).toBe(false);
    const longer = { ...strip, count: 5 }; // …5055 > 5000
    expect(layoutWarnings([H, longer], options.platen).get(43)?.offRail).toBe(true);
  });

  it("takes the strip options as a clean set", () => {
    const input = CreatePlacementInput.parse({
      componentId: 1,
      x: 0,
      y: 0,
      count: 12,
      groupLabel: " ",
      bridgedLevels: [2, 1, 2],
    });
    expect(input).toMatchObject({
      count: 12,
      groupLabel: null,
      bridgedLevels: [1, 2],
      color: null,
    });
    expect(CreatePlacementInput.safeParse({ componentId: 1, x: 0, y: 0, count: 201 }).success).toBe(
      false,
    );
    expect(
      CreatePlacementInput.safeParse({ componentId: 1, x: 0, y: 0, bridgedLevels: [5] }).success,
    ).toBe(false);
  });
});
