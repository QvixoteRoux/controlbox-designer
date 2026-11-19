import { positionOnRail, type Placement } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import { nextTags, PASTE_OFFSET, pasteChanges } from "./paste";

const part = (kind: Placement["part"]["kind"], id: number): Placement["part"] => ({
  componentId: id,
  kind,
  manufacturer: "Acme",
  partNumber: `${kind}-${id}`,
  code: null,
  description: null,
  height: kind === "RAIL" ? 0 : 900,
  width: kind === "RAIL" ? 350 : 450,
  depth: 100,
  railMount: kind !== "RAIL",
  railEdgeOffset: kind === "RAIL" ? null : 200,
  snappable: true,
  expandable: false,
  fillColor: null,
  attributes: kind === "RAIL" ? { stockLength: 20000 } : {},
  active: true,
});

const placement = (id: number, extra: Partial<Placement>): Placement => ({
  id,
  x: 0,
  y: 0,
  rotation: 0,
  length: null,
  locked: false,
  railId: null,
  tag: null,
  zIndex: id,
  count: 1,
  color: null,
  groupLabel: null,
  bridgedLevels: [],
  part: part("STANDARD", 2),
  ...extra,
});

const options = { grid: null, platen: { width: 10000, height: 8000 } };
const rail = placement(1, { part: part("RAIL", 1), x: 500, y: 1000, length: 5000 });
const onRail = (id: number, along: number, extra: Partial<Placement> = {}) =>
  placement(id, { ...positionOnRail(rail, part("STANDARD", 2), along), railId: rail.id, ...extra });

describe("nextTags", () => {
  it("gives the next number after the highest with the same prefix", () => {
    const tag = nextTags(["-K1", "-K6", "-F2", null, "X"]);
    expect([tag("-K1"), tag("-K1"), tag("-F2"), tag("-Q1"), tag(null), tag("X")]).toEqual([
      "-K7",
      "-K8",
      "-F3",
      "-Q1",
      null,
      "X",
    ]);
  });
});

describe("pasteChanges", () => {
  it("lands 10 mm right and down from the originals when the pointer is away", () => {
    const loose = placement(5, { x: 4000, y: 4000, tag: "-A1", locked: true });
    const [change] = pasteChanges([loose], [loose], null, options);
    expect(change).toMatchObject({
      op: "create",
      x: 4000 + PASTE_OFFSET,
      y: 4000 + PASTE_OFFSET,
      tag: "-A2",
      railId: null,
    });
    expect(change).not.toHaveProperty("locked");
  });

  it("drops rail parts onto the rail under the pointer, keeping their spacing", () => {
    const k1 = onRail(2, 0);
    const k2 = onRail(3, 450);
    // Pointer over the rail, further along: the pair lands on it, side by side.
    const changes = pasteChanges([k1, k2], [rail, k1, k2], { x: 3000, y: 1175 }, options);
    expect(changes.map((c) => c.op === "create" && c.railId)).toEqual([rail.id, rail.id]);
    const [a, b] = changes.map((c) => (c.op === "create" ? c : null));
    expect(a?.y).toBe(k1.y);
    expect((b?.x ?? 0) - (a?.x ?? 0)).toBe(450);
  });

  it("pastes a rail with its parts riding the new rail", () => {
    const k1 = onRail(2, 1000);
    const changes = pasteChanges([k1, rail], [rail, k1], null, options);
    expect(changes).toEqual([
      expect.objectContaining({ tempId: -1, componentId: 1, x: 600, y: 1100, length: 5000 }),
      expect.objectContaining({ tempId: -2, railId: -1, x: k1.x + 100, y: k1.y + 100 }),
    ]);
  });
});
