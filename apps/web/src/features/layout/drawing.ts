import {
  formatLength,
  formatRev,
  isProfile,
  isStrip,
  profileDatum,
  toMm,
  type LayoutDetail,
  type Placement,
} from "@cabinet-planner/shared";

// Sizes for drawing the platen, shared by the editor (screen) and the PNG export (drawing).
// Every size the shapes use is a multiple of `px`: one screen pixel in the editor, and a fixed
// real size in the export (DRAWING_PX), so text on an exported drawing is always the same size.

/** Dimension lines: the first one's distance from the platen edge, and the step between, in px. */
export const DIM_FIRST = 18;
export const DIM_STEP = 16;

/**
 * Export only: what one "screen pixel" is on the drawing, in platen units (0.27 mm). Part
 * captions (13 px) come out 3.5 mm high, rail captions 3 mm, dimension labels 2.7 mm. Change
 * this one number to make all drawing text and line weights bigger or smaller.
 */
export const DRAWING_PX = 2.7;

/** Export resolution: 10 px per mm = 1 output pixel per platen unit (0.1 mm). */
export const EXPORT_PX_PER_UNIT = 1;

/** Distinct dimension values (> 0) of the rails and gutters, sorted: one line each. */
export function dimensionValues(placements: Placement[]) {
  const datums = placements.filter((p) => isProfile(p.part.kind)).map((p) => profileDatum(p));
  const distinct = (values: number[]) =>
    [...new Set(values)].filter((v) => v > 0).sort((a, b) => a - b);
  return { x: distinct(datums.map((d) => d.x)), y: distinct(datums.map((d) => d.y)) };
}

/** Room the dimension lines take outside the platen edge for `levels` lines, in platen units. */
export const dimensionBand = (levels: number, px: number) =>
  levels === 0 ? 0 : (DIM_FIRST + (levels - 1) * DIM_STEP + 16) * px;

/** One row of the parts legend. */
export interface LegendRow {
  tag: string;
  manufacturer: string;
  partNumber: string;
  /** "1", "12 pcs" for strips and rows, the cut length for rails and gutters. */
  quantity: string;
}

/**
 * The parts legend: one row per placement. Tagged parts first, in tag order (-K1, -K2,
 * -K10…), then the rest by part number.
 */
export function legendRows(placements: Placement[]): LegendRow[] {
  const byTag = (a: Placement, b: Placement) => {
    if (a.tag !== null && b.tag !== null) {
      return a.tag.localeCompare(b.tag, undefined, { numeric: true });
    }
    if (a.tag !== null) return -1;
    if (b.tag !== null) return 1;
    return a.part.partNumber.localeCompare(b.part.partNumber, undefined, { numeric: true });
  };
  return [...placements].sort(byTag).map((p) => ({
    tag: p.tag ?? "",
    manufacturer: p.part.manufacturer,
    partNumber: p.part.partNumber,
    quantity: isProfile(p.part.kind)
      ? formatLength(p.length ?? 0)
      : isStrip(p.part)
        ? `${p.count} pcs`
        : "1",
  }));
}

/** The title block lines: label and value. */
export function titleLines(layout: LayoutDetail, exportedAt: Date) {
  const { context, cabinet, platen } = layout;
  return [
    ["Project", context.project.name],
    ["Machine", context.machine.name],
    ["Revision", `${formatRev(context.revision.rev)} (${context.revision.status.toLowerCase()})`],
    ["Cabinet", `Cabinet ${cabinet.number}`],
    ["Platen", platen ? `${toMm(platen.width)} × ${toMm(platen.height)} mm` : "none"],
    ["Exported", exportedAt.toISOString().slice(0, 16).replace("T", " ")],
  ] as const;
}

/** Legend and title block sizes, in platen units (text in units too: 3 mm body text). */
export const SHEET = {
  margin: 150,
  gap: 200,
  font: 30,
  headingFont: 38,
  row: 46,
  legendColumns: [
    { key: "tag", title: "Tag", width: 260 },
    { key: "manufacturer", title: "Manufacturer", width: 560 },
    { key: "partNumber", title: "Part number", width: 860 },
    { key: "quantity", title: "Qty / length", width: 560 },
  ] as const,
  titleLabelWidth: 300,
  titleWidth: 1600,
} as const;

export const legendWidth = SHEET.legendColumns.reduce((w, c) => w + c.width, 0);

/** Where everything goes on the exported sheet, in platen units (= output pixels). */
export function sheetLayout(
  platen: { width: number; height: number },
  placements: Placement[],
  legendCount: number,
  titleCount: number,
  px = DRAWING_PX,
) {
  const dims = dimensionValues(placements);
  const origin = {
    x: SHEET.margin + dimensionBand(dims.y.length, px),
    y: SHEET.margin + dimensionBand(dims.x.length, px),
  };
  const platenLabel = 20 * px; // "Platen W × H mm" under the platen
  const legend = {
    x: origin.x + platen.width + SHEET.gap,
    y: origin.y,
    height: SHEET.headingFont + SHEET.row * (legendCount + 1) + SHEET.row / 2,
  };
  const title = {
    x: origin.x,
    y: origin.y + Math.max(platen.height + platenLabel, legend.height) + SHEET.gap,
    width: SHEET.titleWidth,
    height: SHEET.row * titleCount + SHEET.row,
  };
  return {
    origin,
    legend,
    title,
    width: Math.ceil(legend.x + legendWidth + SHEET.margin),
    height: Math.ceil(title.y + title.height + SHEET.margin),
  };
}

/** "Project-Machine-Rev001-Cabinet1-platen.png", safe for file systems. */
export function exportFileName(layout: LayoutDetail) {
  const { context, cabinet } = layout;
  const safe = (s: string) =>
    s
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, "_")
      .replace(/^_+|_+$/g, "");
  return [
    safe(context.project.name),
    safe(context.machine.name),
    formatRev(context.revision.rev).replace(/\s+/g, ""),
    `Cabinet${cabinet.number}`,
    "platen",
  ]
    .filter(Boolean)
    .join("-")
    .concat(".png");
}
