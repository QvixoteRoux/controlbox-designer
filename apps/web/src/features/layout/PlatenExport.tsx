import {
  hasWarning,
  isProfile,
  layoutWarnings,
  toMm,
  type LayoutDetail,
  type LayoutWarnings,
  type Placement,
} from "@cabinet-planner/shared";
import { useMantineTheme } from "@mantine/core";
import type Konva from "konva";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { kindColors } from "./colors";
import { Dimensions } from "./Dimensions";
import {
  DRAWING_PX,
  EXPORT_PX_PER_UNIT,
  LEGEND_PAGE,
  LETTER,
  PAGE,
  SHEET,
  drawingPage,
  exportFileName,
  groupedLegend,
  legendPages,
  legendRows,
  legendWidth,
  letterFileName,
  pageTitle,
  pageTitleHeight,
  sheetLayout,
  titleLines,
} from "./drawing";
import { PlacedShape } from "./LayoutCanvas";

export type ExportKind = "full" | "letter";
/** One exported file. */
export interface ExportFile {
  name: string;
  blob: Blob;
}

type Colors = ReturnType<typeof kindColors>;
type Platen = NonNullable<LayoutDetail["platen"]>;

const noop = () => undefined;
const INK = "#222";

/** A page to render: its size in output pixels and what's on it (output-pixel coordinates). */
interface PageSpec {
  name: string;
  width: number;
  height: number;
  /** The hidden stage is drawn at this scale; toBlob scales it back up to full size. */
  preview: number;
  content: ReactNode;
}

/**
 * Renders the export off screen and hands back the files, once:
 * - "full": one PNG sheet at 10 px per mm (text at a fixed size on the platen, DRAWING_PX),
 *   with a parts legend and title block;
 * - "letter": printable letter pages at 300 dpi: the drawing at the largest standard scale that
 *   fits (text at a fixed size on paper), then the grouped parts legend on page 2 (and more if
 *   needed). Every page has a title block.
 */
export function PlatenExport({
  layout,
  kind,
  onDone,
}: {
  layout: LayoutDetail;
  kind: ExportKind;
  onDone: (result: ExportFile[] | Error) => void;
}) {
  const colors = kindColors(useMantineTheme(), false);
  const [exportedAt] = useState(() => new Date());
  const stages = useRef<(Konva.Stage | null)[]>([]);
  const { platen } = layout;
  const pages = platen
    ? kind === "full"
      ? fullSheet(layout, platen, colors, exportedAt)
      : letterPages(layout, platen, colors, exportedAt)
    : [];

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const files: ExportFile[] = [];
      for (const [i, page] of pages.entries()) {
        const stage = stages.current[i];
        if (!stage) throw new Error("The drawing wasn't ready");
        const blob = await stage.toBlob({ pixelRatio: 1 / page.preview, mimeType: "image/png" });
        files.push({ name: page.name, blob });
      }
      return files;
    };
    run()
      .then((files) => !cancelled && onDone(files))
      .catch((err: unknown) => {
        if (!cancelled) onDone(err instanceof Error ? err : new Error(String(err)));
      });
    return () => {
      cancelled = true;
    };
    // Export once, for the layout it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
      {pages.map((page, i) => (
        <Stage
          key={page.name}
          ref={(stage) => {
            stages.current[i] = stage;
          }}
          width={Math.ceil(page.width * page.preview)}
          height={Math.ceil(page.height * page.preview)}
          scaleX={page.preview}
          scaleY={page.preview}
          listening={false}
        >
          <Layer>
            <Rect width={page.width} height={page.height} fill="#ffffff" />
            {page.content}
          </Layer>
        </Stage>
      ))}
    </div>
  );
}

// ── Pages ──

/** One big sheet at 10 px per mm; text a fixed size on the platen. */
function fullSheet(layout: LayoutDetail, platen: Platen, colors: Colors, exportedAt: Date) {
  const { placements } = layout;
  const rows = legendRows(placements);
  const lines = titleLines(layout, exportedAt);
  const sheet = sheetLayout(platen, placements, rows.length, lines.length);
  const text = { fontSize: SHEET.font, fill: INK, wrap: "none" as const, ellipsis: true };
  const columns = withX(SHEET.legendColumns);
  const cellY = (i: number) => SHEET.headingFont + SHEET.row * (i + 1);
  const page: PageSpec = {
    name: exportFileName(layout),
    width: sheet.width * EXPORT_PX_PER_UNIT,
    height: sheet.height * EXPORT_PX_PER_UNIT,
    // Platen units are output pixels here; draw small and let toBlob enlarge it.
    preview: 0.1,
    content: (
      <>
        <Group x={sheet.origin.x} y={sheet.origin.y}>
          <PlatenDrawing
            platen={platen}
            placements={placements}
            warnings={layoutWarnings(placements, platen)}
            px={DRAWING_PX}
            colors={colors}
          />
        </Group>
        <Group x={sheet.legend.x} y={sheet.legend.y}>
          <Text text="Parts" fontSize={SHEET.headingFont} fontStyle="bold" fill={INK} />
          {columns.map((c) => (
            <Text
              key={c.key}
              x={c.x}
              y={cellY(0) - SHEET.row + 8}
              width={c.width - 20}
              text={c.title}
              fontStyle="bold"
              {...text}
            />
          ))}
          <Line
            points={[0, cellY(0) - 8, legendWidth, cellY(0) - 8]}
            stroke={INK}
            strokeWidth={2}
          />
          {rows.map((row, i) =>
            columns.map((c) => (
              <Text
                key={`${i}-${c.key}`}
                x={c.x}
                y={cellY(i)}
                width={c.width - 20}
                text={row[c.key]}
                {...text}
              />
            )),
          )}
          {rows.length === 0 && <Text y={cellY(0)} text="No parts placed." {...text} />}
        </Group>
        <Group x={sheet.title.x} y={sheet.title.y}>
          <Rect
            width={sheet.title.width}
            height={sheet.title.height}
            stroke={INK}
            strokeWidth={3}
          />
          {lines.map(([label, value], i) => (
            <Group key={label} x={SHEET.row / 2} y={SHEET.row / 2 + i * SHEET.row}>
              <Text text={label} fontStyle="bold" width={SHEET.titleLabelWidth} {...text} />
              <Text
                x={SHEET.titleLabelWidth}
                width={sheet.title.width - SHEET.titleLabelWidth - SHEET.row}
                text={value}
                {...text}
              />
            </Group>
          ))}
        </Group>
      </>
    ),
  };
  return [page];
}

/** Letter pages at 300 dpi: the drawing at a standard scale, then the grouped legend. */
function letterPages(layout: LayoutDetail, platen: Platen, colors: Colors, exportedAt: Date) {
  const { placements } = layout;
  const drawing = drawingPage(platen, placements);
  const legend = legendPages(groupedLegend(placements));
  const of = 1 + legend.length;
  const text = { fontSize: PAGE.font, fill: INK, wrap: "none" as const, ellipsis: true };
  const columns = withX(LEGEND_PAGE.columns);
  const legendWidthPx = LEGEND_PAGE.columns.reduce((w, c) => w + c.width, 0);
  const headerY = PAGE.headingFont + PAGE.row / 2;
  const ruleY = PAGE.headingFont + PAGE.row * 1.4;
  const rowY = (r: number) => PAGE.headingFont + PAGE.row * (r + 1.7);

  const first: PageSpec = {
    name: letterFileName(layout, 1),
    ...drawing.page,
    preview: 1,
    content: (
      <>
        {/* The drawing in platen units, scaled to 1:N on the page. */}
        <Group
          x={drawing.origin.x}
          y={drawing.origin.y}
          scaleX={drawing.pxPerUnit}
          scaleY={drawing.pxPerUnit}
        >
          <PlatenDrawing
            platen={platen}
            placements={placements}
            warnings={layoutWarnings(placements, platen)}
            px={drawing.px}
            colors={colors}
          />
        </Group>
        <PageTitle
          page={drawing.page}
          lines={pageTitle(layout, exportedAt, { number: 1, of, scale: drawing.scale })}
        />
      </>
    ),
  };

  const rest = legend.map((rows, i): PageSpec => ({
    name: letterFileName(layout, i + 2),
    width: LETTER.width,
    height: LETTER.height,
    preview: 1,
    content: (
      <>
        <Group x={PAGE.margin} y={PAGE.margin}>
          <Text
            text={legend.length > 1 ? `Parts (${i + 1}/${legend.length})` : "Parts"}
            fontSize={PAGE.headingFont}
            fontStyle="bold"
            fill={INK}
          />
          {columns.map((c) => (
            <Text
              key={c.key}
              x={c.x}
              y={headerY}
              width={c.width - 16}
              text={c.title}
              fontStyle="bold"
              {...text}
            />
          ))}
          <Line points={[0, ruleY, legendWidthPx, ruleY]} stroke={INK} strokeWidth={2} />
          {rows.map((row, r) =>
            columns.map((c) => (
              <Text
                key={`${r}-${c.key}`}
                x={c.x}
                y={rowY(r)}
                width={c.width - 16}
                text={row[c.key]}
                {...text}
              />
            )),
          )}
          {rows.length === 0 && <Text y={rowY(0)} text="No parts placed." {...text} />}
        </Group>
        <PageTitle
          page={{ width: LETTER.width, height: LETTER.height }}
          lines={pageTitle(layout, exportedAt, { number: i + 2, of, scale: null })}
        />
      </>
    ),
  }));
  return [first, ...rest];
}

/** Columns with their x, from their widths. */
function withX<C extends { width: number }>(columns: readonly C[]) {
  return columns.map((c, i) => ({
    ...c,
    x: columns.slice(0, i).reduce((w, before) => w + before.width, 0),
  }));
}

/**
 * The platen as a drawing, in platen units: outline, 10 mm grid, size label, every part
 * (warnings highlighted, nothing selected) and the rail and gutter dimensions. `px` sets the
 * size of text and line weights (see drawing.ts).
 */
function PlatenDrawing({
  platen,
  placements,
  warnings,
  px,
  colors,
}: {
  platen: { width: number; height: number };
  placements: Placement[];
  warnings: Map<number, LayoutWarnings>;
  px: number;
  colors: Colors;
}) {
  const ordered = [
    ...placements.filter((p) => isProfile(p.part.kind)),
    ...placements.filter((p) => !isProfile(p.part.kind)),
  ];
  const grid = [];
  for (let x = 100; x < platen.width; x += 100) {
    grid.push(
      <Line
        key={`x${x}`}
        points={[x, 0, x, platen.height]}
        stroke={x % 1000 === 0 ? colors.gridMajor : colors.grid}
        strokeWidth={px * 0.6}
      />,
    );
  }
  for (let y = 100; y < platen.height; y += 100) {
    grid.push(
      <Line
        key={`y${y}`}
        points={[0, y, platen.width, y]}
        stroke={y % 1000 === 0 ? colors.gridMajor : colors.grid}
        strokeWidth={px * 0.6}
      />,
    );
  }
  return (
    <>
      <Rect
        width={platen.width}
        height={platen.height}
        fill={colors.platen}
        stroke={colors.platenEdge}
        strokeWidth={2 * px}
      />
      {grid}
      <Text
        y={platen.height + 6 * px}
        width={platen.width}
        align="center"
        text={`Platen ${toMm(platen.width)} × ${toMm(platen.height)} mm`}
        fontSize={12 * px}
        fill={INK}
      />
      {ordered.map((p) => (
        <PlacedShape
          key={p.id}
          placement={p}
          warn={hasWarning(warnings.get(p.id))}
          selected={false}
          lengthHandle={false}
          draggable={false}
          px={px}
          colors={colors}
          snap={(v) => v}
          onPress={noop}
          onClick={noop}
          onDragMove={noop}
          onDragEnd={noop}
          onLength={noop}
        />
      ))}
      <Dimensions placements={placements} px={px} colors={colors} />
    </>
  );
}

/** The title block across the bottom of a letter page: three rows of two label / value pairs. */
function PageTitle({
  page,
  lines,
}: {
  page: { width: number; height: number };
  lines: readonly (readonly [string, string])[];
}) {
  const width = page.width - 2 * PAGE.margin;
  const top = page.height - PAGE.margin - pageTitleHeight;
  const half = width / 2;
  const label = 230;
  const text = { fontSize: PAGE.font, fill: INK, wrap: "none" as const, ellipsis: true };
  return (
    <Group x={PAGE.margin} y={top}>
      <Rect width={width} height={pageTitleHeight} stroke={INK} strokeWidth={3} />
      <Line points={[half, 0, half, pageTitleHeight]} stroke={INK} strokeWidth={1.5} />
      {lines.map(([name, value], i) => (
        <Group
          key={name}
          x={(i % 2) * half + PAGE.row / 2}
          y={PAGE.row / 2 + Math.floor(i / 2) * PAGE.row}
        >
          <Text text={name} fontStyle="bold" width={label} {...text} />
          <Text x={label} width={half - label - PAGE.row} text={value} {...text} />
        </Group>
      ))}
    </Group>
  );
}
