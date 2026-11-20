import type { FaceNeighbours } from "@cabinet-planner/shared";
import { Group, Text } from "react-konva";

interface Props {
  /** The drawn face or platen, in canvas pixels. */
  box: { left: number; top: number; right: number; bottom: number };
  sides: FaceNeighbours;
  /** Gap between each edge and its label: one for all four, or per edge (e.g. to clear dimension lines). */
  gap: number | Record<keyof FaceNeighbours, number>;
  fontSize: number;
  fill: string;
}

/**
 * Names the cabinet face past each edge of a drawing (TOP above, LEFT on the left, …), so a view
 * of any side shows where the others are. Side labels read along their edge: bottom to top on the
 * left, top to bottom on the right.
 */
export function SideLabels({ box, sides, gap, fontSize, fill }: Props) {
  const gaps = typeof gap === "number" ? { top: gap, bottom: gap, left: gap, right: gap } : gap;
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const text = { fontSize, fill, fontStyle: "bold", align: "center", listening: false } as const;
  return (
    <Group listening={false}>
      <Text
        {...text}
        text={sides.top}
        x={box.left}
        y={box.top - gaps.top - fontSize}
        width={width}
      />
      <Text {...text} text={sides.bottom} x={box.left} y={box.bottom + gaps.bottom} width={width} />
      <Text
        {...text}
        text={sides.left}
        x={box.left - gaps.left - fontSize}
        y={box.bottom}
        width={height}
        rotation={-90}
      />
      <Text
        {...text}
        text={sides.right}
        x={box.right + gaps.right + fontSize}
        y={box.top}
        width={height}
        rotation={90}
      />
    </Group>
  );
}
