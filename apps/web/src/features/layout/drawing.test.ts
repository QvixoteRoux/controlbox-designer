import type { LayoutDetail, Placement } from "@cabinet-planner/shared";
import { describe, expect, it } from "vitest";
import {
  DRAWING_PX,
  SHEET,
  dimensionBand,
  dimensionValues,
  drawingPage,
  groupedLegend,
  LEGEND_PAGE,
  legendPages,
  letterFileName,
  PAPER_PX_MM,
  PLATEN_LABEL,
  PLATEN_SIDES,
  SIDE_FONT,
  SIDE_GAP,
  pagePxPerUnit,
  pageDrawingPx,
  exportFileName,
  legendRows,
  legendWidth,
  sheetLayout,
  sideLabelGaps,
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
  },
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

describe("side labels", () => {
  it("sit past the dimension lines above and left, past the size label below", () => {
    const px = 2;
    const dims = { x: [500, 900], y: [1175] };
    expect(sideLabelGaps(dims, px)).toEqual({
      top: dimensionBand(2, px) + SIDE_GAP * px,
      left: dimensionBand(1, px) + SIDE_GAP * px,
      right: SIDE_GAP * px,
      bottom: (PLATEN_LABEL + SIDE_GAP) * px,
    });
    // Dimensions hidden (editor toggle): right at the edge.
    expect(sideLabelGaps(null, px).top).toBe(SIDE_GAP * px);
  });

  it("show the platen's neighbours as seen from the front", () => {
    expect(PLATEN_SIDES).toEqual({ top: "TOP", bottom: "BOTTOM", left: "LEFT", right: "RIGHT" });
  });
});

describe("sheetLayout", () => {
  const label = (SIDE_GAP + SIDE_FONT) * DRAWING_PX;

  it("leaves room for the dimension lines and side labels around the platen", () => {
    const sheet = sheetLayout({ width: 6000, height: 8000 }, [rail], 1, 6);
    expect(dimensionValues([rail])).toEqual({ x: [500], y: [1175] });
    expect(sheet.origin).toEqual({
      x: SHEET.margin + dimensionBand(1, DRAWING_PX) + label,
      y: SHEET.margin + dimensionBand(1, DRAWING_PX) + label,
    });
    expect(sheet.legend.x).toBe(sheet.origin.x + 6000 + label + SHEET.gap);
    expect(sheet.width).toBe(Math.ceil(sheet.legend.x + legendWidth + SHEET.margin));
    expect(sheet.title.y).toBeGreaterThan(
      sheet.origin.y + 8000 + PLATEN_LABEL * DRAWING_PX + label,
    );
  });

  it("needs no dimension band without rails or gutters, only the side labels", () => {
    const { origin } = sheetLayout({ width: 6000, height: 8000 }, [k2], 1, 6);
    expect(origin.x).toBeCloseTo(SHEET.margin + label, 6);
    expect(origin.y).toBeCloseTo(SHEET.margin + label, 6);
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

describe("letter pages", () => {
  it("draws a 1120 × 1420 mm platen at 1:10 portrait", () => {
    const page = drawingPage({ width: 11200, height: 14200 }, [rail]);
    expect(page).toMatchObject({ orientation: "portrait", scale: 10 });
    expect(page.page).toEqual({ width: 2550, height: 3300 });
  });

  it("turns a wide platen landscape when that allows a larger scale", () => {
    expect(drawingPage({ width: 12000, height: 6000 }, [])).toMatchObject({
      orientation: "landscape",
      scale: 5,
    });
  });

  it("prints text the same size on paper at any scale", () => {
    for (const scale of [5, 10, 20]) {
      // 13 px caption: px in platen units × output px per unit → paper mm.
      const paperMm = (13 * pageDrawingPx(scale) * pagePxPerUnit(scale) * 25.4) / 300;
      expect(paperMm).toBeCloseTo(13 * PAPER_PX_MM, 5);
    }
  });

  it("groups identical parts, adding up strips and keeping rail lengths apart", () => {
    const ib16 = (id: number, tag: string | null) =>
      placement(id, { tag, part: part("STANDARD", "5069-IB16") });
    const rows = groupedLegend([
      ib16(10, null),
      ib16(11, "-A2"),
      ib16(12, "-A1"),
      strip,
      placement(5, { count: 8, part: part("TERMINAL_BLOCK", "WDU 2.5") }),
      rail,
      placement(6, { part: part("RAIL", "TS35"), length: 12000 }),
      placement(7, { part: part("RAIL", "TS35"), length: 2000 }),
    ]);
    expect(rows).toEqual([
      expect.objectContaining({ partNumber: "5069-IB16", quantity: "3", tags: "-A1, -A2" }),
      expect.objectContaining({ partNumber: "TS35", quantity: "2 × 1200 mm / 47.24 in" }),
      expect.objectContaining({ partNumber: "TS35", quantity: "1 × 200 mm / 7.87 in" }),
      expect.objectContaining({ partNumber: "WDU 2.5", quantity: "20 pcs" }),
    ]);
  });

  it("splits a long legend over pages, and always has one page", () => {
    const row = { quantity: "1", manufacturer: "", partNumber: "", description: "", tags: "" };
    const rows = Array.from({ length: LEGEND_PAGE.rowsPerPage + 1 }, () => row);
    expect(legendPages(rows).map((p) => p.length)).toEqual([LEGEND_PAGE.rowsPerPage, 1]);
    expect(legendPages([])).toEqual([[]]);
    expect(letterFileName(layout([]), 2)).toBe(
      "Line_4_Retrofit-Press-Rev001-Cabinet2-platen-letter-2.png",
    );
  });
});

describe("relays on a base in the parts lists", () => {
  const relayPart = part("RELAY", "RE-4C", {
    attributes: {
      baseMount: true,
      relay: { width: 280, height: 400, depth: 360 },
      base: { manufacturer: "Europa", partNumber: "RB11S", width: 300, height: 380, depth: 280 },
      mountedDepth: 650,
      baseRailEdgeOffset: 200,
    },
  });
  const k1 = placement(20, { tag: "-K1", part: relayPart });
  const k2 = placement(21, { tag: "-K2", part: relayPart });

  it("lists the base under each relay on the full sheet", () => {
    expect(legendRows([k1]).map((r) => [r.partNumber, r.quantity])).toEqual([
      ["RE-4C", "1"],
      ["RB11S", "1 (base)"],
    ]);
  });

  it("counts identical bases together on the letter legend", () => {
    expect(groupedLegend([k2, k1])).toEqual([
      expect.objectContaining({ partNumber: "RE-4C", quantity: "2", tags: "-K1, -K2" }),
      expect.objectContaining({
        partNumber: "RB11S",
        quantity: "2",
        description: "Relay base",
        tags: "-K1, -K2",
      }),
    ]);
  });
});
