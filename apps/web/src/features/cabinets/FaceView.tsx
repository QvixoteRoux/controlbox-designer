import {
  faceSize,
  openingShape,
  shapeBounds,
  toMm,
  type Face,
  type HingeSide,
  type Opening,
  type OpeningWarnings,
} from "@cabinet-planner/shared";
import { Box, useComputedColorScheme, useMantineTheme } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";

interface Props {
  cabinet: { width: number; height: number; depth: number; hingeSide: HingeSide };
  face: Face;
  /** Openings on this face. */
  openings: Opening[];
  warnings: Map<number, OpeningWarnings>;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const PAD = 28;
const MAX_HEIGHT = 440;

/**
 * One cabinet face to scale, seen from outside: origin at the face's top-left corner, +y down
 * (guidelines/units-and-coordinates.md). Openings are clickable; red = outside the face or
 * overlapping another opening.
 */
export function FaceView({ cabinet, face, openings, warnings, selectedId, onSelect }: Props) {
  const { ref, width: boxWidth } = useElementSize();
  const theme = useMantineTheme();
  const dark = useComputedColorScheme("light") === "dark";

  const size = faceSize(cabinet, face);
  const scale = Math.min((boxWidth - 2 * PAD) / size.width, (MAX_HEIGHT - 2 * PAD) / size.height);
  const stageHeight = size.height * scale + 2 * PAD;
  // Face coordinates (0.1 mm, top-left origin, +y down) → canvas pixels.
  const left = (boxWidth - size.width * scale) / 2;
  const top = PAD;
  const px = (x: number) => left + x * scale;
  const py = (y: number) => top + y * scale;

  const colors = {
    face: dark ? theme.colors.dark[5] : theme.colors.gray[1],
    edge: dark ? theme.colors.dark[1] : theme.colors.gray[7],
    axis: dark ? theme.colors.dark[3] : theme.colors.gray[4],
    text: dark ? theme.colors.dark[0] : theme.colors.gray[8],
    window: theme.colors.cyan[5],
    hole: dark ? theme.colors.gray[4] : theme.colors.gray[7],
    gland: theme.colors.violet[5],
    warn: theme.colors.red[6],
    selected: theme.colors.blue[5],
    hinge: theme.colors.orange[6],
  };

  const right = px(size.width);
  const bottom = py(size.height);

  return (
    <Box ref={ref} w="100%">
      {boxWidth > 0 && scale > 0 && (
        <Stage width={boxWidth} height={stageHeight}>
          <Layer>
            <Rect
              x={left}
              y={top}
              width={right - left}
              height={bottom - top}
              fill={colors.face}
              stroke={colors.edge}
              strokeWidth={2}
            />
            {/* Origin marker: X to the right, Y down from the top-left corner. */}
            <Arrow
              points={[left, top, left + 22, top]}
              stroke={colors.axis}
              fill={colors.axis}
              pointerLength={5}
              pointerWidth={5}
            />
            <Arrow
              points={[left, top, left, top + 22]}
              stroke={colors.axis}
              fill={colors.axis}
              pointerLength={5}
              pointerWidth={5}
            />
            <Text x={left + 25} y={top - 14} text="X" fill={colors.text} fontSize={10} />
            <Text x={left - 12} y={top + 16} text="Y" fill={colors.text} fontSize={10} />
            <Text x={left - 12} y={top - 14} text="0" fill={colors.text} fontSize={10} />

            {face === "FRONT" &&
              (cabinet.hingeSide === "LEFT" || cabinet.hingeSide === "RIGHT") && (
                <Line
                  points={
                    cabinet.hingeSide === "LEFT"
                      ? [left, top, left, bottom]
                      : [right, top, right, bottom]
                  }
                  stroke={colors.hinge}
                  strokeWidth={5}
                />
              )}
            {face === "FRONT" &&
              (cabinet.hingeSide === "TOP" || cabinet.hingeSide === "BOTTOM") && (
                <Line
                  points={
                    cabinet.hingeSide === "TOP"
                      ? [left, top, right, top]
                      : [left, bottom, right, bottom]
                  }
                  stroke={colors.hinge}
                  strokeWidth={5}
                />
              )}

            <Text
              x={left}
              y={bottom + 6}
              width={right - left}
              align="center"
              text={`${toMm(size.width)} × ${toMm(size.height)} mm`}
              fill={colors.text}
              fontSize={12}
            />

            {openings.map((o) => {
              const shape = openingShape(o);
              if (!shape) return null;
              const w = warnings.get(o.id);
              const warn = w ? w.outside || w.overlaps.length > 0 : false;
              const base =
                o.kind === "WINDOW"
                  ? colors.window
                  : o.kind === "CABLE_GLAND"
                    ? colors.gland
                    : colors.hole;
              const stroke = o.id === selectedId ? colors.selected : warn ? colors.warn : base;
              const common = {
                stroke,
                strokeWidth: o.id === selectedId ? 3 : 2,
                fill: warn ? `${colors.warn}33` : `${base}33`,
              };
              const caption = o.label ?? (o.kind === "CABLE_GLAND" ? o.gland?.size : undefined);
              const b = shapeBounds(shape);
              const centreX = px((b.left + b.right) / 2);
              const bottomEdge = py(b.bottom);

              return (
                <Group
                  key={o.id}
                  onClick={() => onSelect(o.id)}
                  onTap={() => onSelect(o.id)}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "pointer";
                  }}
                  onMouseLeave={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = "default";
                  }}
                >
                  {shape.round ? (
                    <Circle
                      x={px(shape.x)}
                      y={py(shape.y)}
                      radius={Math.max((shape.diameter / 2) * scale, 2)}
                      {...common}
                    />
                  ) : (
                    <Rect
                      x={px(shape.x)}
                      y={py(shape.y)}
                      width={Math.max(shape.width * scale, 2)}
                      height={Math.max(shape.height * scale, 2)}
                      {...common}
                    />
                  )}
                  {caption && (
                    <Text
                      x={centreX - 60}
                      y={bottomEdge + 3}
                      width={120}
                      align="center"
                      text={caption}
                      fontSize={11}
                      fill={colors.text}
                    />
                  )}
                </Group>
              );
            })}
          </Layer>
        </Stage>
      )}
    </Box>
  );
}
