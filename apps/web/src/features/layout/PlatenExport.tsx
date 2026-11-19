import {
  hasWarning,
  isProfile,
  layoutWarnings,
  toMm,
  type LayoutDetail,
} from "@cabinet-planner/shared";
import { useMantineTheme } from "@mantine/core";
import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import { kindColors } from "./colors";
import { Dimensions } from "./Dimensions";
import {
  DRAWING_PX,
  EXPORT_PX_PER_UNIT,
  SHEET,
  legendRows,
  legendWidth,
  sheetLayout,
  titleLines,
} from "./drawing";
import { PlacedShape } from "./LayoutCanvas";

/** The hidden stage is drawn at 1/10 scale; toBlob scales it back up (keeps its canvases small). */
const PREVIEW = 0.1;
const noop = () => undefined;

/**
 * Renders the platen as a drawing sheet off screen and hands back a PNG: the platen with its
 * grid, parts (warnings highlighted), the rail and gutter dimensions, a parts legend on the
 * right and a title block underneath. Light colours on white, text at a fixed real size
 * (DRAWING_PX), 10 px per mm. Mount it to export; it calls onDone once.
 */
export function PlatenExport({
  layout,
  onDone,
}: {
  layout: LayoutDetail;
  onDone: (result: Blob | Error) => void;
}) {
  const stageRef = useRef<Konva.Stage>(null);
  const colors = kindColors(useMantineTheme(), false);
  const [exportedAt] = useState(() => new Date());
  const { platen, placements } = layout;

  useEffect(() => {
    let cancelled = false;
    const stage = stageRef.current;
    if (!stage) return;
    stage
      .toBlob({ pixelRatio: EXPORT_PX_PER_UNIT / PREVIEW, mimeType: "image/png" })
      .then((blob) => !cancelled && onDone(blob))
      .catch(
        (err: unknown) => !cancelled && onDone(err instanceof Error ? err : new Error(String(err))),
      );
    return () => {
      cancelled = true;
    };
    // Export once, for the layout it was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!platen) return null;
  const px = DRAWING_PX;
  const warnings = layoutWarnings(placements, platen);
  const rows = legendRows(placements);
  const lines = titleLines(layout, exportedAt);
  const sheet = sheetLayout(platen, placements, rows.length, lines.length);
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

  const text = { fontSize: SHEET.font, fill: "#222", wrap: "none" as const, ellipsis: true };
  const columns = SHEET.legendColumns.map((c, i) => ({
    ...c,
    x: SHEET.legendColumns.slice(0, i).reduce((w, before) => w + before.width, 0),
  }));
  const cellY = (i: number) => SHEET.headingFont + SHEET.row * (i + 1);

  return (
    <div aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none" }}>
      <Stage
        ref={stageRef}
        width={Math.ceil(sheet.width * PREVIEW)}
        height={Math.ceil(sheet.height * PREVIEW)}
        scaleX={PREVIEW}
        scaleY={PREVIEW}
        listening={false}
      >
        <Layer>
          <Rect width={sheet.width} height={sheet.height} fill="#ffffff" />

          <Group x={sheet.origin.x} y={sheet.origin.y}>
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
              fill="#222"
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
          </Group>

          {/* Parts legend */}
          <Group x={sheet.legend.x} y={sheet.legend.y}>
            <Text text="Parts" fontSize={SHEET.headingFont} fontStyle="bold" fill="#222" />
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
              stroke="#222"
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

          {/* Title block */}
          <Group x={sheet.title.x} y={sheet.title.y}>
            <Rect
              width={sheet.title.width}
              height={sheet.title.height}
              stroke="#222"
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
        </Layer>
      </Stage>
    </div>
  );
}
