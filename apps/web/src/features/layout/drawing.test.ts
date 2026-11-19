import type { LayoutDetail, Placement } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import {
  DRAWING_PX,
  SHEET,
  dimensionBand,
  dimensionValues,
  exportFileName,
  legendRows,
  legendWidth,
  sheetLayout,
  titleLines,
} from "./drawing";

const part = (
  kind: Placement["part"]["kind"],
  partNumber: string,
  extra: Partial<Placement["part"]> = {},
): Placement["part"] => ({
  componentId: 1,
  kind,
  manufacturer: "Acme",
  partNumber,
  code: null,
  description: null,
  height: kind === "RAIL" ? 0 : 900,
  width: kind === "RAIL" ? 350 : 450,
  depth: 100,
  railMount: kind !== "RAIL",
  railEdgeOffset: null,
  snappable: true,
  expandable: false,
  fillColor: null,
  attributes: {},
  active: true,
  ...extra,
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
  part: part("STANDARD", "K-1"),
  ...extra,
});

const rail = placement(1, { part: part("RAIL", "TS35"), x: 500, y: 1000, length: 12000 });
const k10 = placement(2, { tag: "-K10", part: part("STANDARD", "K-10") });
const k2 = placement(3, { tag: "-K2", part: part("STANDARD", "K-2") });
const strip = placement(4, { count: 12, part: part("TERMINAL_BLOCK", "WDU 2.5") });

const layout = (placements: Placement[]): LayoutDetail => ({
  context: {
    project: { id: 1, name: "Line 4 / Retrofit" },
    machine: { id: 2, name: "Press" },
    revision: { id: 3, rev: 1, status: "WORKING" },
  } as LayoutDetail["context"],
  cabinet: { id: 5, number: 2, depth: 2000, hasPlaten: true },
  platen: { width: 6000, height: 8000 } as LayoutDetail["platen"],
  placements,
});

describe("legendRows", () => {
  it("lists tagged parts first in tag order, then the rest by part number", () => {
    const rows = legendRows([strip, k10, rail, k2]);
    expect(rows.map((r) => r.tag || r.partNumber)).toEqual(["-K2", "-K10", "TS35", "WDU 2.5"]);
  });

  it("gives strips their count and rails their cut length", () => {
    const rows = legendRows([strip, rail, k2]);
    expect(rows.find((r) => r.partNumber === "WDU 2.5")?.quantity).toBe("12 pcs");
    expect(rows.find((r) => r.partNumber === "TS35")?.quantity).toBe("1200 mm / 47.24 in");
    expect(rows.find((r) => r.partNumber === "K-2")?.quantity).toBe("1");
  });
});

describe("sheetLayout", () => {
  it("leaves room for the dimension lines above and left of the platen", () => {
    const sheet = sheetLayout({ width: 6000, height: 8000 }, [rail], 1, 6);
    expect(dimensionValues([rail])).toEqual({ x: [500], y: [1175] });
    expect(sheet.origin).toEqual({
      x: SHEET.margin + dimensionBand(1, DRAWING_PX),
      y: SHEET.margin + dimensionBand(1, DRAWING_PX),
    });
    expect(sheet.legend.x).toBe(sheet.origin.x + 6000 + SHEET.gap);
    expect(sheet.width).toBe(Math.ceil(sheet.legend.x + legendWidth + SHEET.margin));
    expect(sheet.title.y).toBeGreaterThan(sheet.origin.y + 8000);
  });

  it("needs no dimension band without rails or gutters", () => {
    expect(sheetLayout({ width: 6000, height: 8000 }, [k2], 1, 6).origin).toEqual({
      x: SHEET.margin,
      y: SHEET.margin,
    });
  });
});

describe("title block and file name", () => {
  it("names the project, machine, revision and cabinet", () => {
    const l = layout([]);
    expect(exportFileName(l)).toBe("Line_4_Retrofit-Press-Rev001-Cabinet2-platen.png");
    const lines = Object.fromEntries(titleLines(l, new Date("2026-11-18T21:30:00Z")));
    expect(lines).toMatchObject({
      Project: "Line 4 / Retrofit",
      Cabinet: "Cabinet 2",
      Platen: "600 × 800 mm",
      Exported: "2026-11-18 21:30",
    });
  });
});
