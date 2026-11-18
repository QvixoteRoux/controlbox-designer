import { formatLength, isProfile, profileDatum, type Placement } from "@cabinet-planner/shared";
import { Arrow, Group, Line, Text } from "react-konva";
import type { kindColors } from "./colors";

/** Screen pixels: first dimension line's distance from the platen edge, and the step between. */
const FIRST = 18;
const STEP = 16;

/**
 * X / Y dimension lines for every rail and gutter, outside the platen: X dimensions above its
 * top edge, Y dimensions left of its left edge, one level each so they don't overlap
 * (nearest values closest to the platen). Labels in mm and inches. Drawn from the layout as
 * shown, so they follow a drag.
 */
export function Dimensions({
  placements,
  px,
  colors,
}: {
  placements: Placement[];
  px: number;
  colors: ReturnType<typeof kindColors>;
}) {
  const datums = placements.filter((p) => isProfile(p.part.kind)).map((p) => profileDatum(p));
  const xs = [...new Set(datums.map((d) => d.x))].filter((x) => x > 0).sort((a, b) => a - b);
  const ys = [...new Set(datums.map((d) => d.y))].filter((y) => y > 0).sort((a, b) => a - b);
  const fontSize = 10 * px;
  const stroke = colors.dimension;
  const arrow = {
    stroke,
    fill: stroke,
    strokeWidth: px,
    pointerLength: 6 * px,
    pointerWidth: 5 * px,
    pointerAtBeginning: true,
    listening: false,
  };
  const extension = { stroke, strokeWidth: px, dash: [3 * px, 3 * px], opacity: 0.7 };
  const over = 4 * px; // extension lines run a little past the dimension line

  return (
    <Group listening={false}>
      {xs.map((x, i) => {
        const at = -(FIRST + i * STEP) * px;
        const from = datums
          .filter((d) => d.x === x)
          .reduce((top, d) => Math.min(top, d.y), Infinity);
        return (
          <Group key={`x${x}`}>
            <Line points={[0, 0, 0, at - over]} {...extension} />
            <Line points={[x, from, x, at - over]} {...extension} />
            <Arrow points={[0, at, x, at]} {...arrow} />
            <Text
              x={0}
              y={at - fontSize - 2 * px}
              width={x}
              align="center"
              text={formatLength(x)}
              fontSize={fontSize}
              fill={stroke}
              wrap="none"
            />
          </Group>
        );
      })}
      {ys.map((y, i) => {
        const at = -(FIRST + i * STEP) * px;
        const from = datums
          .filter((d) => d.y === y)
          .reduce((left, d) => Math.min(left, d.x), Infinity);
        return (
          <Group key={`y${y}`}>
            <Line points={[0, 0, at - over, 0]} {...extension} />
            <Line points={[from, y, at - over, y]} {...extension} />
            <Arrow points={[at, 0, at, y]} {...arrow} />
            {/* Reads bottom to top, like the part captions. */}
            <Text
              x={at - fontSize - 2 * px}
              y={y}
              width={y}
              rotation={-90}
              align="center"
              text={formatLength(y)}
              fontSize={fontSize}
              fill={stroke}
              wrap="none"
            />
          </Group>
        );
      })}
    </Group>
  );
}
