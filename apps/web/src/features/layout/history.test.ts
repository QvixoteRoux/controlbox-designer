import { positionOnRail, type Placement } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import { changesTo, newIds, remapIds } from "./history";
import { followMoves, slideWithChain } from "./moves";

const part = (kind: Placement["part"]["kind"], extra: Partial<Placement["part"]> = {}) => ({
  componentId: kind === "RAIL" ? 1 : 2,
  kind,
  manufacturer: "Acme",
  partNumber: kind,
  code: null,
  description: null,
  height: kind === "RAIL" ? 0 : 900,
  width: kind === "RAIL" ? 350 : 450,
  depth: 100,
  railMount: kind !== "RAIL",
  railEdgeOffset: kind === "RAIL" ? null : 200,
  snappable: false,
  expandable: false,
  attributes: kind === "RAIL" ? { stockLength: 20000 } : {},
  active: true,
  ...extra,
});

const placement = (id: number, extra: Partial<Placement> = {}): Placement => ({
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
  part: part("STANDARD"),
  ...extra,
});

const rail = placement(1, { part: part("RAIL"), x: 500, y: 1000, length: 3000 });
const onRail = placement(2, { ...positionOnRail(rail, part("STANDARD"), 300), railId: 1 });
const loose = placement(3, { x: 4000, y: 4000 });
const platen = { width: 10000, height: 8000 };

describe("changesTo (undo / redo)", () => {
  it("is empty when nothing differs", () => {
    expect(changesTo([rail, onRail], [rail, onRail]).changes).toEqual([]);
  });

  it("moves a rail back and lets it carry its parts, without moving them twice", () => {
    const movedRail = { ...rail, x: 700 };
    const carried = { ...onRail, x: onRail.x + 200 };
    const { changes } = changesTo([movedRail, carried, loose], [rail, onRail, loose]);
    expect(changes).toEqual([{ op: "update", id: 1, patch: { x: 500 } }]);
  });

  it("re-creates a deleted rail first and puts its parts back on it", () => {
    const { changes, tempIds } = changesTo(
      [{ ...onRail, railId: null }, loose],
      [rail, onRail, loose],
    );
    expect(changes).toEqual([
      expect.objectContaining({
        op: "create",
        tempId: -1,
        componentId: 1,
        length: 3000,
        zIndex: 1,
      }),
      { op: "update", id: 2, patch: { railId: -1 } },
    ]);
    expect(tempIds).toEqual(new Map([[1, -1]]));
  });

  it("deletes parts the target doesn't have", () => {
    expect(changesTo([rail, loose], [rail]).changes).toEqual([{ op: "delete", id: 3 }]);
  });

  it("renames re-created parts everywhere afterwards", () => {
    const ids = newIds(new Map([[1, -1]]), [{ tempId: -1, id: 42 }]);
    const renamed = remapIds([rail, onRail], ids);
    expect(renamed.map((p) => [p.id, p.railId])).toEqual([
      [42, null],
      [2, 42],
    ]);
  });
});

describe("followMoves (multi-select, nudge)", () => {
  it("moves loose parts by the distance and keeps locked ones", () => {
    const locked = placement(4, { locked: true });
    const moves = followMoves([loose, locked], 10, -10, [loose, locked], platen);
    expect([...moves]).toEqual([[3, { x: 4010, y: 3990, rotation: 0, railId: null }]]);
  });

  it("lets parts on a moving rail ride along", () => {
    const moves = followMoves([rail, onRail], 100, 0, [rail, onRail], platen);
    expect([...moves.keys()]).toEqual([1]);
  });

  it("keeps parts on a rail that stays: they slide along it, not off it", () => {
    const along = followMoves([onRail], 10, 0, [rail, onRail], platen).get(2);
    expect(along).toMatchObject({ x: onRail.x + 10, y: onRail.y, railId: 1 });
    const across = followMoves([onRail], 0, 10, [rail, onRail], platen).get(2);
    expect(across).toMatchObject({ x: onRail.x, y: onRail.y, railId: 1 });
  });
});

describe("slideWithChain (drag a part with its row)", () => {
  // Rail 300 mm long; three 45 mm parts butted at 0, 45 and 90 mm along it.
  const butted = (id: number, along: number) =>
    placement(id, { ...positionOnRail(rail, part("STANDARD"), along), railId: 1 });
  const first = butted(10, 0);
  const last = butted(12, 900);
  const all = [rail, first, butted(11, 450), last];

  it("slides as asked when the row stays on the rail", () => {
    const to = positionOnRail(rail, part("STANDARD"), 1000);
    expect(slideWithChain(first, to, [11, 12], all)).toEqual({ x: to.x, y: to.y });
  });

  it("stops the row at the rail's end instead of the dragged part's", () => {
    // The dragged part alone could go to 255 mm; the row (135 mm) only to 165 mm.
    const to = positionOnRail(rail, part("STANDARD"), 2550);
    expect(slideWithChain(first, to, [11, 12], all).x).toBe(rail.x + 1650);
  });

  it("stops the row at the rail's start, dragging from the far end", () => {
    const to = positionOnRail(rail, part("STANDARD"), 0);
    expect(slideWithChain(last, to, [10, 11], all).x).toBe(rail.x + 900);
  });
});
