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

// ── Letter pages (printable) ──
// A letter page at 300 dpi. Unlike the full-size sheet, text has a fixed size on the *paper*:
// one "px" of the shapes is PAPER_PX_MM on paper, whatever the scale, so a 1:10 drawing and a
// 1:5 drawing print the same text size.

/** Letter, portrait, at 300 dpi (8.5 × 11 in). */
export const LETTER = { width: 2550, height: 3300, dpi: 300 } as const;
/** Paper millimetres per output pixel. */
export const MM_PER_PAGE_PX = 25.4 / LETTER.dpi;
/** One shape "px" on paper: 0.17 mm, so captions print 2.2 mm high, dimension labels 1.7 mm. */
export const PAPER_PX_MM = 0.17;
/** Standard scales tried, largest drawing first (1:N). */
export const STANDARD_SCALES = [1, 2, 5, 10, 15, 20, 25, 50, 100] as const;

export const PAGE = {
  margin: 120, // 0.4 in
  font: 30, // ≈ 2.5 mm
  headingFont: 40,
  row: 42,
  titleRows: 3,
  gap: 40,
} as const;
/** The title block across the bottom of every page: 3 rows of label / value pairs. */
export const pageTitleHeight = PAGE.row * PAGE.titleRows + PAGE.row;

/** Output pixels per platen unit (0.1 mm) at 1:N. */
export const pagePxPerUnit = (scale: number) => 0.1 / scale / MM_PER_PAGE_PX;
/** The shapes' "px" in platen units at 1:N, so it prints PAPER_PX_MM. */
export const pageDrawingPx = (scale: number) => PAPER_PX_MM * 10 * scale;

type Orientation = "portrait" | "landscape";
const pageSize = (o: Orientation) =>
  o === "portrait"
    ? { width: LETTER.width, height: LETTER.height }
    : { width: LETTER.height, height: LETTER.width };

/**
 * The drawing page: the largest standard scale at which the platen, its dimension lines and
 * its size label fit on a letter page above the title block, in the orientation that allows
 * the larger scale (portrait on a tie). Positions in output pixels; `origin` is the platen's
 * top-left corner. Falls back to the smallest scale even if it overflows.
 */
export function drawingPage(platen: { width: number; height: number }, placements: Placement[]) {
  const dims = dimensionValues(placements);
  const fit = (orientation: Orientation, scale: number) => {
    const page = pageSize(orientation);
    const px = pageDrawingPx(scale);
    const k = pagePxPerUnit(scale);
    const left = dimensionBand(dims.y.length, px) * k;
    const top = dimensionBand(dims.x.length, px) * k;
    const label = 20 * px * k;
    const width = left + platen.width * k;
    const height = top + platen.height * k + label;
    const areaW = page.width - 2 * PAGE.margin;
    const areaH = page.height - 2 * PAGE.margin - pageTitleHeight - PAGE.gap;
    return {
      fits: width <= areaW && height <= areaH,
      layout: {
        orientation,
        scale,
        px,
        pxPerUnit: k,
        page,
        // Centred in the drawing area.
        origin: {
          x: PAGE.margin + (areaW - width) / 2 + left,
          y: PAGE.margin + (areaH - height) / 2 + top,
        },
      },
    };
  };
  for (const scale of STANDARD_SCALES) {
    const portrait = fit("portrait", scale);
    if (portrait.fits) return portrait.layout;
    const landscape = fit("landscape", scale);
    if (landscape.fits) return landscape.layout;
  }
  return fit("portrait", STANDARD_SCALES.at(-1) ?? 100).layout;
}

/** One row of the grouped parts legend. */
export interface GroupedRow {
  quantity: string;
  manufacturer: string;
  partNumber: string;
  description: string;
  tags: string;
}

/**
 * The legend for print: identical parts in one row. Same part number (and, for rails and
 * gutters, the same cut length) → one row with how many there are, strips adding up their
 * modules, and the tags of the placements in the group. Sorted by first tag, then part number.
 */
export function groupedLegend(placements: Placement[]): GroupedRow[] {
  const groups = new Map<string, Placement[]>();
  for (const p of placements) {
    const key = [
      p.part.componentId,
      p.part.manufacturer,
      p.part.partNumber,
      isProfile(p.part.kind) ? p.length : "",
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const numeric = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return [...groups.values()]
    .map((ps) => {
      const first = ps[0]!;
      const tags = ps.flatMap((p) => (p.tag ? [p.tag] : [])).sort(numeric);
      const quantity = isProfile(first.part.kind)
        ? `${ps.length} × ${formatLength(first.length ?? 0)}`
        : isStrip(first.part)
          ? `${ps.reduce((n, p) => n + p.count, 0)} pcs`
          : String(ps.length);
      return {
        quantity,
        manufacturer: first.part.manufacturer,
        partNumber: first.part.partNumber,
        description: first.part.description ?? "",
        tags: tags.join(", "),
      };
    })
    .sort(
      (a, b) =>
        (a.tags === "" ? 1 : 0) - (b.tags === "" ? 1 : 0) ||
        numeric(a.tags, b.tags) ||
        numeric(a.partNumber, b.partNumber),
    );
}

/** Legend pages (portrait): columns in output pixels, and how many rows fit on a page. */
export const LEGEND_PAGE = {
  columns: [
    { key: "quantity", title: "Qty", width: 380 },
    { key: "manufacturer", title: "Manufacturer", width: 420 },
    { key: "partNumber", title: "Part number", width: 560 },
    { key: "description", title: "Description", width: 570 },
    { key: "tags", title: "Tags", width: 380 },
  ] as const,
  rowsPerPage: Math.floor(
    (LETTER.height - 2 * PAGE.margin - pageTitleHeight - PAGE.gap - PAGE.headingFont - PAGE.row) /
      PAGE.row,
  ),
};

/** Splits the legend rows into pages. Always at least one page (it may say "no parts"). */
export function legendPages(rows: GroupedRow[]): GroupedRow[][] {
  const pages: GroupedRow[][] = [];
  for (let i = 0; i < rows.length; i += LEGEND_PAGE.rowsPerPage) {
    pages.push(rows.slice(i, i + LEGEND_PAGE.rowsPerPage));
  }
  return pages.length > 0 ? pages : [[]];
}

/** Title block for a letter page: label / value pairs, filled in three rows of two. */
export function pageTitle(
  layout: LayoutDetail,
  exportedAt: Date,
  page: { number: number; of: number; scale: number | null },
) {
  const { context, cabinet, platen } = layout;
  return [
    ["Project", context.project.name],
    ["Cabinet", `Cabinet ${cabinet.number}`],
    ["Machine", context.machine.name],
    ["Platen", platen ? `${toMm(platen.width)} × ${toMm(platen.height)} mm` : "none"],
    ["Revision", `${formatRev(context.revision.rev)} (${context.revision.status.toLowerCase()})`],
    [
      page.scale === null ? "Page" : "Scale",
      page.scale === null
        ? `${page.number} of ${page.of} · exported ${exportedAt.toISOString().slice(0, 16).replace("T", " ")}`
        : `1:${page.scale} · page ${page.number} of ${page.of} · exported ${exportedAt.toISOString().slice(0, 16).replace("T", " ")}`,
    ],
  ] as const;
}

/** "…-platen-letter-1.png", "…-platen-letter-2.png"… */
export const letterFileName = (layout: LayoutDetail, page: number) =>
  exportFileName(layout).replace(/\.png$/, `-letter-${page}.png`);
